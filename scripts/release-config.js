const RELEASE_ENVIRONMENTS = new Set(["preview", "staging", "production"]);

const RELEASE_VARIABLES = [
  "APP_VERSION",
  "EAS_PROJECT_ID",
  "EXPO_IOS_BUNDLE_IDENTIFIER",
  "EXPO_ANDROID_PACKAGE",
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "EXPO_PUBLIC_SENTRY_DSN",
  "SENTRY_ORG",
  "SENTRY_PROJECT",
  "SENTRY_AUTH_TOKEN",
];

function value(env, name) {
  return env[name]?.trim();
}

function isReleaseConfiguration(env = process.env) {
  return (
    env.PORTL_VALIDATE_RELEASE === "1" ||
    RELEASE_ENVIRONMENTS.has(value(env, "APP_ENV")) ||
    RELEASE_ENVIRONMENTS.has(value(env, "EAS_BUILD_PROFILE"))
  );
}

function missingReleaseVariables(env = process.env) {
  return RELEASE_VARIABLES.filter((name) => !value(env, name));
}

function assertReleaseConfiguration(env = process.env) {
  if (!isReleaseConfiguration(env)) return;

  const missing = missingReleaseVariables(env);
  if (missing.length) {
    throw new Error(
      `Release configuration is incomplete. Set these variables in the matching EAS environment: ${missing.join(
        ", ",
      )}. See docs/RELEASE.md.`,
    );
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value(env, "EAS_PROJECT_ID"))) {
    throw new Error("EAS_PROJECT_ID must be the UUID assigned by `eas init`.");
  }
  for (const name of ["EXPO_IOS_BUNDLE_IDENTIFIER", "EXPO_ANDROID_PACKAGE"]) {
    if (!/^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9_-]*)+$/.test(value(env, name))) {
      throw new Error(`${name} must be a reverse-DNS application identifier.`);
    }
  }
  if (!value(env, "EXPO_PUBLIC_SUPABASE_URL").startsWith("https://")) {
    throw new Error("EXPO_PUBLIC_SUPABASE_URL must be an HTTPS URL.");
  }
  if (!value(env, "EXPO_PUBLIC_SENTRY_DSN").startsWith("https://")) {
    throw new Error("EXPO_PUBLIC_SENTRY_DSN must be an HTTPS DSN.");
  }
  if (!/^\d+\.\d+\.\d+$/.test(value(env, "APP_VERSION"))) {
    throw new Error("APP_VERSION must be an explicit x.y.z release version.");
  }
}

module.exports = {
  RELEASE_VARIABLES,
  assertReleaseConfiguration,
  isReleaseConfiguration,
  missingReleaseVariables,
};
