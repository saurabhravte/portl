import { isRunningInExpoGo } from "expo";
import React from "react";
import { Platform, Text, View } from "react-native";

type Props = {
  /** Called after a session is activated (defaults to router.replace("/")). */
  onComplete?: () => void;
  label?: string;
  disabled?: boolean;
};

/**
 * Google sign-in entry point.
 * Expo Go cannot load Clerk's native Google module — hide the button and
 * never import the native implementation there (that import crashes Expo Go).
 */
export function GoogleSignInButton(props: Props) {
  if (
    isRunningInExpoGo() ||
    (Platform.OS !== "ios" && Platform.OS !== "android")
  ) {
    return null;
  }

  // Lazy require so Expo Go never evaluates `@clerk/expo/google`
  // (which calls requireNativeModule("ClerkGoogleSignIn") at import time).
  /* eslint-disable @typescript-eslint/no-require-imports -- intentional lazy load for Expo Go */
  const { GoogleSignInButtonNative } =
    require("./GoogleSignInButtonNative") as typeof import("./GoogleSignInButtonNative");
  /* eslint-enable @typescript-eslint/no-require-imports */

  return <GoogleSignInButtonNative {...props} />;
}

/** Optional note shown only in Expo Go so users know Google needs a custom build. */
export function GoogleSignInExpoGoHint() {
  if (!isRunningInExpoGo()) return null;
  return (
    <View className="rounded-md border border-border bg-surface-alt px-3 py-2">
      <Text className="text-caption text-ink-muted">
        Google Sign-In needs a development/preview build — it is not available
        in Expo Go. Use email or username below.
      </Text>
    </View>
  );
}
