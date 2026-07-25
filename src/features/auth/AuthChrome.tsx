import { AppIcon } from "@/components/ui";
import { useThemeStore } from "@/stores/theme";
import { useThemeColors } from "@/theme/useThemeColors";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { GoogleSignInButton } from "./GoogleSignInButton";

const lightModeIcon = require("../../../assets/lightmode.png");
const darkModeIcon = require("../../../assets/darkmode.png");

/** Divider used between primary auth CTA and social buttons. */
export function AuthOrDivider({ label = "Or continue with" }: { label?: string }) {
  return (
    <View className="flex-row items-center gap-3 py-1">
      <View className="h-px flex-1 bg-border" />
      <Text className="text-caption text-ink-muted">{label}</Text>
      <View className="h-px flex-1 bg-border" />
    </View>
  );
}

export function AuthFooterLegal() {
  return (
    <Text className="text-center text-caption text-ink-muted">
      By continuing you agree to Portl's Terms of Service and Privacy Policy.
    </Text>
  );
}

export function AuthBackRow({
  onPress,
  label = "Back",
}: {
  onPress: () => void;
  label?: string;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="mb-2 min-h-11 flex-row items-center self-start active:opacity-70"
    >
      <AppIcon name="back" size={22} color={colors.ink} />
      <Text className="ml-1 text-label text-ink">{label}</Text>
    </Pressable>
  );
}

/** Circular back control + theme toggle row (mockup auth header). */
export function AuthScreenTopBar() {
  const router = useRouter();
  const colors = useThemeColors();

  const onBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(auth)/onboarding" as never);
  };

  return (
    <View className="mb-4 flex-row items-center justify-between">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        className="h-11 w-11 items-center justify-center rounded-pill bg-surface-alt active:opacity-70"
      >
        <AppIcon name="back" size={20} color={colors.ink} />
      </Pressable>
      <AuthThemeToggle />
    </View>
  );
}

/** Toggles light/dark using the bundled mode icons. */
export function AuthThemeToggle() {
  const scheme = useColorScheme();
  const setMode = useThemeStore((s) => s.setMode);
  const isDark = scheme === "dark";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onPress={() => setMode(isDark ? "light" : "dark")}
      className="h-11 w-11 items-center justify-center rounded-pill bg-surface-alt active:opacity-70"
    >
      <Image
        source={isDark ? lightModeIcon : darkModeIcon}
        style={{ width: 28, height: 28 }}
        contentFit="contain"
        accessibilityIgnoresInvertColors
      />
    </Pressable>
  );
}

/** Full-width navy CTA matching the auth mockup. */
export function AuthPrimaryButton({
  title,
  onPress,
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      onPress={onPress}
      disabled={disabled || loading}
      className={`min-h-12 items-center justify-center rounded-xl bg-ink px-4 ${
        disabled ? "opacity-50" : "active:opacity-85"
      }`}
    >
      {loading ? (
        <ActivityIndicator color={colors.inverse} />
      ) : (
        <Text className="text-label font-semibold text-inverse">{title}</Text>
      )}
    </Pressable>
  );
}

/** Side-by-side social buttons from the auth mockup. */
export function AuthSocialRow({
  googleLabel = "Continue with Google",
  disabled,
}: {
  googleLabel?: string;
  disabled?: boolean;
}) {
  const colors = useThemeColors();

  return (
    <View className="flex-row gap-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Apple sign-in is not available yet"
        accessibilityState={{ disabled: true }}
        disabled
        className="min-h-12 flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-surface-alt opacity-45"
      >
        <Ionicons name="logo-apple" size={20} color={colors.ink} />
        <Text className="text-caption font-semibold text-ink" numberOfLines={1}>
          Login account
        </Text>
      </Pressable>
      <View className="min-h-12 flex-1">
        <GoogleSignInButton
          label={googleLabel}
          disabled={disabled}
          layout="compact"
        />
      </View>
    </View>
  );
}
