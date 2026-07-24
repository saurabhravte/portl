import { AppIcon } from "@/components/ui";
import { clerkErrorMessage } from "@/features/auth/identity";
import { useThemeColors } from "@/theme/useThemeColors";
import { useSignInWithGoogle } from "@clerk/expo/google";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
} from "react-native";

type Props = {
  onComplete?: () => void;
  label?: string;
  disabled?: boolean;
};

/**
 * Native-only Google button. Do not import this file from Expo Go code paths —
 * use `GoogleSignInButton.tsx`, which lazy-loads this module in custom builds.
 */
export function GoogleSignInButtonNative({
  onComplete,
  label = "Continue with Google",
  disabled,
}: Props) {
  const { startGoogleAuthenticationFlow } = useSignInWithGoogle();
  const router = useRouter();
  const colors = useThemeColors();
  const [busy, setBusy] = useState(false);

  const onPress = async () => {
    setBusy(true);
    try {
      const { createdSessionId, setActive } =
        await startGoogleAuthenticationFlow();

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        if (onComplete) onComplete();
        else router.replace("/");
        return;
      }

      Alert.alert(
        "Google sign-in incomplete",
        "Google did not create a session. Enable Google in the Clerk Dashboard and check your OAuth client IDs.",
      );
    } catch (error) {
      const code =
        error && typeof error === "object"
          ? String((error as { code?: unknown }).code ?? "")
          : "";
      if (code === "SIGN_IN_CANCELLED" || code === "-5" || code === "12501") {
        return;
      }
      Alert.alert(
        "Google sign-in failed",
        clerkErrorMessage(
          error,
          "Could not sign in with Google. Check your Clerk + Google configuration.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || busy}
      onPress={() => void onPress()}
      className={`min-h-11 flex-row items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-3 ${
        disabled || busy ? "opacity-50" : "active:opacity-80"
      }`}
    >
      {busy ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <AppIcon name="google" size={20} color={colors.ink} />
          <Text className="text-label text-ink">{label}</Text>
        </>
      )}
    </Pressable>
  );
}
