const { withUniwindConfig } = require("uniwind/metro");
const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");
const path = require("path");

const config = getSentryExpoConfig(__dirname);
const projectRoot = path.resolve(__dirname);
const expoGoPushWarnShim = path.resolve(
  projectRoot,
  "metro-shims/warnOfExpoGoPushUsage.js",
);

// Expo Go Android throws when expo-notifications registers push-token listeners.
// Remap that helper so local Expo Go can boot; push still needs a dev build.
const previousResolveRequest = config.resolver?.resolveRequest;
config.resolver = {
  ...config.resolver,
  resolveRequest(context, moduleName, platform) {
    if (
      moduleName === "./warnOfExpoGoPushUsage" ||
      moduleName === "./warnOfExpoGoPushUsage.js" ||
      moduleName.endsWith("/warnOfExpoGoPushUsage") ||
      moduleName.endsWith("/warnOfExpoGoPushUsage.js")
    ) {
      const fromNotifications = context.originModulePath.includes(
        `${path.sep}expo-notifications${path.sep}`,
      );
      if (fromNotifications) {
        return { type: "sourceFile", filePath: expoGoPushWarnShim };
      }
    }
    if (typeof previousResolveRequest === "function") {
      return previousResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

// Escape Windows paths for use inside a RegExp.
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Windows often hits EMFILE ("too many open files") during large Metro rebuilds.
// Cap workers hard and ignore heavy project folders only (not node_modules paths).
if (process.platform === "win32") {
  config.maxWorkers = 1;

  const previousBlockList = config.resolver?.blockList;
  const root = escapeRegex(projectRoot);
  config.resolver = {
    ...config.resolver,
    blockList: [
      ...(Array.isArray(previousBlockList)
        ? previousBlockList
        : previousBlockList
          ? [previousBlockList]
          : []),
      // Only the project's own folders — never node_modules/*android*
      new RegExp(`${root}[/\\\\]\\.git[/\\\\]`),
      new RegExp(`${root}[/\\\\]\\.expo[/\\\\]`),
      new RegExp(`${root}[/\\\\]android[/\\\\]`),
      new RegExp(`${root}[/\\\\]ios[/\\\\]`),
      new RegExp(`${root}[/\\\\]supabase[/\\\\]`),
      new RegExp(`${root}[/\\\\]\\.maestro[/\\\\]`),
      new RegExp(`${root}[/\\\\]docs[/\\\\]`),
    ],
  };
  config.watchFolders = [projectRoot];
  config.watcher = {
    ...config.watcher,
    // Fewer parallel FS ops — reduces EMFILE under large node_modules trees.
    unstable_workerThreads: false,
  };
}

module.exports = withUniwindConfig(config, {
  cssEntryFile: "./src/global.css",
  dtsFile: "./src/uniwind-types.d.ts",
});
