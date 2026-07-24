/**
 * Re-apply Expo Go compatibility patches after install.
 *
 * @clerk/expo@3.7.x Android specs use requireNativeModule, which crashes Expo Go
 * before Clerk's JS-only path can run. Upstream fixed this in 4.x by switching to
 * requireOptionalNativeModule — mirror that here until we upgrade.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

const patches = [
  {
    file: path.join(
      root,
      "node_modules/@clerk/expo/dist/specs/NativeClerkModule.android.js",
    ),
    find: 'requireNativeModule)("ClerkExpo")',
    replace: 'requireOptionalNativeModule)("ClerkExpo")',
  },
  {
    file: path.join(
      root,
      "node_modules/@clerk/expo/dist/specs/NativeClerkGoogleSignIn.android.js",
    ),
    find: 'requireNativeModule)("ClerkGoogleSignIn")',
    replace: 'requireOptionalNativeModule)("ClerkGoogleSignIn")',
  },
  {
    file: path.join(
      root,
      "node_modules/@clerk/expo/src/specs/NativeClerkModule.android.ts",
    ),
    find: "requireNativeModule",
    replace: "requireOptionalNativeModule",
    all: true,
  },
  {
    file: path.join(
      root,
      "node_modules/@clerk/expo/src/specs/NativeClerkGoogleSignIn.android.ts",
    ),
    find: "requireNativeModule",
    replace: "requireOptionalNativeModule",
    all: true,
  },
];

let changed = 0;
for (const patch of patches) {
  if (!fs.existsSync(patch.file)) continue;
  const before = fs.readFileSync(patch.file, "utf8");
  if (!before.includes(patch.find)) continue;
  const after = patch.all
    ? before.split(patch.find).join(patch.replace)
    : before.replace(patch.find, patch.replace);
  if (after === before) continue;
  fs.writeFileSync(patch.file, after);
  changed += 1;
  console.log(`[patch-expo-go-compat] patched ${path.relative(root, patch.file)}`);
}

if (changed === 0) {
  console.log("[patch-expo-go-compat] nothing to patch (already applied or packages missing)");
}
