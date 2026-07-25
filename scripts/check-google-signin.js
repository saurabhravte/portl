#!/usr/bin/env node
/**
 * Google Sign-In preflight.
 *
 * The native Google flow fails at TAP TIME, not build time, and the error
 * Google returns (DEVELOPER_ERROR / status 10) says nothing about which of
 * the five possible causes it is. This script checks the four that are
 * verifiable from the repo, so a broken build is caught before it ships.
 *
 *   node scripts/check-google-signin.js
 */
const path = require("path");

// dotenv is a devDependency; stay useful if this runs before `bun install`.
try {
  const dotenv = require("dotenv");
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });
  dotenv.config({ path: path.resolve(process.cwd(), ".env"), quiet: true });
} catch {
  console.warn(
    "  note  dotenv unavailable — reading the ambient environment only.",
  );
}

const appJson = require("../app.json").expo;

const problems = [];
const warnings = [];
const ok = [];

/* 1 — Client IDs present. Metro only inlines EXPO_PUBLIC_* into your own
 *     source, never into node_modules, so @clerk/expo reads them from
 *     `extra`. Both routes must resolve. */
const CLIENT_IDS = [
  ["EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID", true],
  ["EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID", true],
  ["EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID", true],
  ["EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME", false],
];

for (const [key, required] of CLIENT_IDS) {
  const value = process.env[key]?.trim();
  if (!value) {
    (required ? problems : warnings).push(
      `${key} is not set. Without it the button throws "missing ${key}" the moment it is tapped.`,
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
if (iosId && iosScheme) {
  const expected = `com.googleusercontent.apps.${iosId.replace(
    /\.apps\.googleusercontent\.com$/,
    "",
  )}`;
  if (iosScheme !== expected) {
    problems.push(
      `EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME does not match the iOS client id.\n` +
        `      expected: ${expected}\n` +
        `      actual:   ${iosScheme}`,
    );
  } else {
    ok.push("iOS URL scheme matches the iOS client id");
  }
}

/* 3 — Bundle id / package must match what the OAuth clients were created
 *     against. This is the bug that broke Google Sign-In in this repo:
 *     app.config.js used to override app.json with "com.portl.dev". */
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
ok.push(`effective iOS bundle id: ${effectiveIos}`);
ok.push(`effective Android package: ${effectiveAndroid}`);

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

/* ── report ─────────────────────────────────────────────────────────── */
console.log("\nGoogle Sign-In preflight\n" + "=".repeat(48));
for (const line of ok) console.log(`  ok    ${line}`);
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
console.log("No blocking problems found.\n");
