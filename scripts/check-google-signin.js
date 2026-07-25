#!/usr/bin/env node
/**
 * Google Sign-In preflight.
 *
 * The native Google flow fails at TAP TIME, not build time, and the error
 * Google returns (DEVELOPER_ERROR / status 10) says nothing about which of
 * the possible causes it is. This script checks the five that are verifiable
 * from the repo, so a broken build is caught before it ships.
 *
 *   node scripts/check-google-signin.js            # both platforms, iOS keys warn
 *   node scripts/check-google-signin.js android    # ignore iOS keys entirely
 *   node scripts/check-google-signin.js ios        # iOS keys are blocking
 *   node scripts/check-google-signin.js all        # everything blocking (CI gate)
 *
 * Platform may also be supplied as PLATFORM=ios in the environment.
 *
 * WHY THE TARGET EXISTS
 *   `missingGoogleAuthKeys()` in src/features/auth/googleAuthConfig.ts only
 *   requires the iOS client ID when Platform.OS === "ios". A preflight that
 *   hard-failed on a missing iOS key would be stricter than the app itself
 *   and would block Android-only work for no reason. Default is therefore to
 *   report iOS gaps as warnings; pass `ios` or `all` to make them blocking.
 */
const path = require("path");

// dotenv is a devDependency; stay useful if this runs before `bun install`.
try {
  const dotenv = require("dotenv");
  dotenv.config({
    path: path.resolve(process.cwd(), ".env.local"),
    quiet: true,
  });
  dotenv.config({ path: path.resolve(process.cwd(), ".env"), quiet: true });
} catch {
  console.warn(
    "  note  dotenv unavailable — reading the ambient environment only.",
  );
}

const appJson = require("../app.json").expo;

/* ── target platform ─────────────────────────────────────────────────── */
const VALID_TARGETS = ["default", "android", "ios", "all"];
const rawTarget = (
  process.env.PLATFORM ??
  process.argv[2] ??
  "default"
).toLowerCase();

if (!VALID_TARGETS.includes(rawTarget)) {
  console.error(
    `\nUnknown target "${rawTarget}". Use one of: ${VALID_TARGETS.join(", ")}\n`,
  );
  process.exit(2);
}

const TARGET = rawTarget;
const checksIos = TARGET !== "android";
/** iOS keys only block a build that actually targets iOS. */
const iosBlocking = TARGET === "ios" || TARGET === "all";

const problems = [];
const warnings = [];
const ok = [];
const skipped = [];

/* 1 — Client IDs present. Metro only inlines EXPO_PUBLIC_* into your own
 *     source, never into node_modules, so @clerk/expo reads them from
 *     `extra`. Both routes must resolve. */
const CLIENT_IDS = [
  // [env var, blocking?, applies on this target?]
  ["EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID", true, true],
  ["EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID", true, TARGET !== "ios"],
  ["EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID", iosBlocking, checksIos],
  ["EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME", false, checksIos],
];

for (const [key, blocking, applies] of CLIENT_IDS) {
  if (!applies) {
    skipped.push(`${key} (not required for target "${TARGET}")`);
    continue;
  }
  const value = process.env[key]?.trim();
  if (!value) {
    // Only nudge about re-running for iOS when iOS is NOT already the target;
    // saying "re-run with ios" while the target IS ios reads as nonsense.
    const suffix =
      !blocking &&
      !iosBlocking &&
      key.startsWith("EXPO_PUBLIC_CLERK_GOOGLE_IOS")
        ? " Blocks iOS builds only — re-run with `ios` before shipping to iOS."
        : "";
    (blocking ? problems : warnings).push(
      `${key} is not set. Without it the button throws "missing ${key}" the moment it is tapped.${suffix}`,
    );
    continue;
  }
  ok.push(`${key} is set`);
}

/* 2 — The iOS URL scheme must be the REVERSED iOS client id. Getting this
 *     wrong sends iOS back to the browser sheet instead of the native
 *     credential picker, or drops the callback entirely. */
const iosId = process.env.EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID?.trim();
const iosScheme = process.env.EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME?.trim();
if (checksIos && iosId && iosScheme) {
  const expected = `com.googleusercontent.apps.${iosId.replace(
    /\.apps\.googleusercontent\.com$/,
    "",
  )}`;
  if (iosScheme !== expected) {
    const message =
      `EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME does not match the iOS client id.\n` +
      `      expected: ${expected}\n` +
      `      actual:   ${iosScheme}`;
    (iosBlocking ? problems : warnings).push(message);
  } else {
    ok.push("iOS URL scheme matches the iOS client id");
  }
}

/* 3 — Bundle id / package must match what the OAuth clients were created
 *     against. app.config.js used to override app.json with "com.portl.dev",
 *     which produced an unregistered package and a DEVELOPER_ERROR on tap.
 *     app.json is now the source of truth; env vars override deliberately. */
const envIos = process.env.EXPO_IOS_BUNDLE_IDENTIFIER?.trim();
const envAndroid = process.env.EXPO_ANDROID_PACKAGE?.trim();
const effectiveIos = envIos || appJson.ios?.bundleIdentifier;
const effectiveAndroid = envAndroid || appJson.android?.package;

if (envIos && envIos !== appJson.ios?.bundleIdentifier) {
  warnings.push(
    `EXPO_IOS_BUNDLE_IDENTIFIER (${envIos}) overrides app.json (${appJson.ios?.bundleIdentifier}).\n` +
      `      The iOS OAuth client must be registered for "${envIos}".`,
  );
}
if (envAndroid && envAndroid !== appJson.android?.package) {
  warnings.push(
    `EXPO_ANDROID_PACKAGE (${envAndroid}) overrides app.json (${appJson.android?.package}).\n` +
      `      The Android OAuth client must be registered for "${envAndroid}" + this build's SHA-1.`,
  );
}
if (checksIos) ok.push(`effective iOS bundle id: ${effectiveIos}`);
if (TARGET !== "ios") ok.push(`effective Android package: ${effectiveAndroid}`);

/* 4 — The @clerk/expo config plugin injects the iOS URL scheme into
 *     Info.plist and applies the clerk-android packaging fixes. Without it
 *     the native module is not wired up at all. */
const plugins = appJson.plugins ?? [];
const hasClerk = plugins.some((p) =>
  Array.isArray(p) ? p[0] === "@clerk/expo" : p === "@clerk/expo",
);
if (!hasClerk) {
  problems.push(
    '"@clerk/expo" is missing from expo.plugins in app.json. The native Google module will not be linked.',
  );
} else {
  ok.push("@clerk/expo config plugin present");
}

/* 5 — expo-crypto is required by the native Google flow. */
const deps = require("../package.json").dependencies ?? {};
if (!deps["expo-crypto"]) {
  problems.push(
    "expo-crypto is not installed. @clerk/expo's native Google sign-in requires it.",
  );
} else {
  ok.push("expo-crypto installed");
}

/* ── report ──────────────────────────────────────────────────────────── */
console.log(
  `\nGoogle Sign-In preflight  (target: ${TARGET})\n` + "=".repeat(48),
);
for (const line of ok) console.log(`  ok    ${line}`);
for (const line of skipped) console.log(`  skip  ${line}`);
for (const line of warnings) console.log(`  warn  ${line}`);
for (const line of problems) console.log(`  FAIL  ${line}`);

console.log(
  "\nNot verifiable from the repo — check these by hand if the button still fails:\n" +
    "  * Google Cloud Console: the Android OAuth client's SHA-1 must match the\n" +
    "    keystore this build is signed with. EAS-managed credentials use a\n" +
    "    DIFFERENT SHA-1 from your local debug keystore, so register both.\n" +
    "      eas credentials -p android          (EAS build SHA-1)\n" +
    "      keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android\n" +
    "  * Clerk Dashboard: Google enabled as an SSO connection with\n" +
    '    "Use custom credentials" ON, and the SHA-256 registered under\n' +
    "    Native Applications.\n" +
    "  * The Android emulator must use a Google Play system image —\n" +
    "    Credential Manager is unavailable on plain AOSP images.\n",
);

if (problems.length) {
  console.error(`${problems.length} blocking problem(s) found.\n`);
  process.exit(1);
}
if (warnings.length) {
  console.log(
    `No blocking problems for target "${TARGET}" (${warnings.length} warning(s) above).\n`,
  );
} else {
  console.log("No blocking problems found.\n");
}
