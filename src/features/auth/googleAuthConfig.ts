import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Google Sign-In configuration.
 *
 * Clerk's native Google module needs OAuth client IDs at call time. When they
 * are absent `startGoogleAuthenticationFlow()` throws a bare
 * "missing EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID", which surfaces only after
 * the user taps the button — the failure this module exists to prevent.
 *
 * Values arrive by two routes and both must be checked:
 *   1. `process.env.EXPO_PUBLIC_*` — inlined by Metro at bundle time.
 *   2. `Constants.expoConfig.extra` — populated by app.config.js, which is
 *      what release bundles built through EAS actually read.
 */
type ExtraConfig = Record<string, unknown>;

function fromExtra(key: string): string | undefined {
  const extra = (Constants.expoConfig?.extra ?? {}) as ExtraConfig;
  const value = extra[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function read(key: string, inlined: string | undefined): string | undefined {
  const direct = inlined?.trim();
  return direct || fromExtra(key);
}

export interface GoogleAuthConfig {
  webClientId?: string;
  iosClientId?: string;
  androidClientId?: string;
  iosUrlScheme?: string;
}

export function getGoogleAuthConfig(): GoogleAuthConfig {
  return {
    // These reads must stay as literal `process.env.X` expressions — Metro
    // only substitutes EXPO_PUBLIC_* when it can see the full property access.
    webClientId: read(
      "EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID",
      process.env.EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID,
    ),
    iosClientId: read(
      "EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID",
      process.env.EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID,
    ),
    androidClientId: read(
      "EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID",
      process.env.EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID,
    ),
    iosUrlScheme: read(
      "EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME",
      process.env.EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME,
    ),
  };
}

/**
 * Env var names required on the current platform. The web client ID is always
 * needed — Google issues the ID token against it on both platforms — plus the
 * matching native client ID.
 */
export function missingGoogleAuthKeys(): string[] {
  const config = getGoogleAuthConfig();
  const missing: string[] = [];

  if (!config.webClientId) {
    missing.push("EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID");
  }
  if (Platform.OS === "ios" && !config.iosClientId) {
    missing.push("EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID");
  }
  if (Platform.OS === "android" && !config.androidClientId) {
    missing.push("EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID");
  }
  return missing;
}

export function isGoogleSignInConfigured(): boolean {
  return missingGoogleAuthKeys().length === 0;
}

/** Operator-facing setup message. Shown in dev builds only. */
export function googleAuthSetupHint(): string {
  const missing = missingGoogleAuthKeys();
  if (missing.length === 0) return "";
  return `Google Sign-In is not configured. Add ${missing.join(
    ", ",
  )} to .env.local (or the EAS environment) and enable Google in the Clerk Dashboard, then rebuild — EXPO_PUBLIC_* values are inlined at build time.`;
}
