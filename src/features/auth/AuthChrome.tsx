import { AppIcon } from "@/components/ui";
import { useThemeStore } from "@/stores/theme";
import { useThemeColors } from "@/theme/useThemeColors";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import {
  Pressable,
  Text,
  useColorScheme,
  View,
} from "react-native";

const lightModeIcon = require("../../../assets/app-icons-light-dark/Light/iOS/AppIcon-1024.png");
const darkModeIcon = require("../../../assets/app-icons-light-dark/Dark/iOS/AppIcon-1024.png");

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

/*
 * REMOVED (Phase 3.3 / 7.1 / 7.5)
 * -------------------------------
 * `AuthPrimaryButton` was a second button implementation used only on the
 * auth screens: `bg-ink` + `rounded-xl` where the shared <Button> is
 * `bg-primary` + `rounded-md`. Two components rendering "the primary action"
 * two different ways is exactly the screen-specific one-off Phase 3.3
 * forbids, and it meant the auth CTA silently ignored the brand CTA token.
 * Auth screens now use the shared <Button>.
 *
 * `AuthSocialRow` rendered a permanently disabled Apple button labelled
 * "Login account" next to the real Google one. Apple sign-in is not wired up,
 * so it was a dead control taking half the row and implying a capability that
 * does not exist. Use <GoogleSignInButton /> directly.
 */
