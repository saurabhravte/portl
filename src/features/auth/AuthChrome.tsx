import { AppIcon } from "@/components/ui";
import { useThemeColors } from "@/theme/useThemeColors";
import React from "react";
import { Pressable, Text, View } from "react-native";

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
