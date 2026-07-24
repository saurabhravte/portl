const path = require("path");
require("dotenv").config({
  path: path.resolve(process.cwd(), ".env.local"),
  quiet: true,
});
require("dotenv").config({
  path: path.resolve(process.cwd(), ".env"),
  quiet: true,
});

const {
  assertReleaseConfiguration,
  isReleaseConfiguration,
} = require("./scripts/release-config");

module.exports = ({ config }) => {
  assertReleaseConfiguration(process.env);

  const release = isReleaseConfiguration(process.env);
  const projectId = process.env.EAS_PROJECT_ID?.trim();
  const sentryOrg = process.env.SENTRY_ORG?.trim();
  const sentryProject = process.env.SENTRY_PROJECT?.trim();
  const appEnvironment = process.env.APP_ENV?.trim() || "development";
  const plugins = [...(config.plugins ?? [])];

  if (sentryOrg && sentryProject) {
    plugins.push([
      "@sentry/react-native/expo",
      { organization: sentryOrg, project: sentryProject },
    ]);
  }

  return {
    ...config,
    name: process.env.EXPO_APP_NAME?.trim() || config.name,
    version: process.env.APP_VERSION?.trim() || config.version,
    owner: process.env.EXPO_OWNER?.trim() || config.owner,
    ios: {
      ...config.ios,
      bundleIdentifier:
        process.env.EXPO_IOS_BUNDLE_IDENTIFIER?.trim() || "com.portl.dev",
      buildNumber: process.env.IOS_BUILD_NUMBER?.trim() || "1",
    },
    android: {
      ...config.android,
      package: process.env.EXPO_ANDROID_PACKAGE?.trim() || "com.portl.dev",
      versionCode: Number.parseInt(process.env.ANDROID_VERSION_CODE || "1", 10),
    },
    // Native Google Sign-In module (paired with @clerk/expo already in app.json).
    plugins: [...plugins, "@clerk/expo-google-signin"],
    runtimeVersion: { policy: "appVersion" },
    updates: projectId
      ? {
          enabled: true,
          url: `https://u.expo.dev/${projectId}`,
          checkAutomatically: "ON_LOAD",
          fallbackToCacheTimeout: 0,
        }
      : { enabled: false },
    extra: {
      ...(config.extra ?? {}),
      appEnvironment,
      eas: projectId ? { projectId } : undefined,
      // Clerk Google Sign-In reads these from app config in production bundles.
      EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID:
        process.env.EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID?.trim() || undefined,
      EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID:
        process.env.EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID?.trim() || undefined,
      EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID:
        process.env.EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID?.trim() ||
        undefined,
      EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME:
        process.env.EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME?.trim() || undefined,
    },
    description: release
      ? config.description
      : config.description || "Portl development build",
  };
};
