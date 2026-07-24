import { Image } from "expo-image";
import React from "react";
import { Text, View } from "react-native";

const logo = require("../../assets/images/logo.png");

type BrandMarkProps = {
  size?: "sm" | "md" | "lg" | "hero";
  showWordmark?: boolean;
  subtitle?: string;
  className?: string;
};

const sizes = {
  sm: 28,
  md: 48,
  lg: 72,
  hero: 112,
} as const;

/** Shared Portl building mark + optional wordmark for auth, splash, and onboarding. */
export function BrandMark({
  size = "md",
  showWordmark = false,
  subtitle,
  className,
}: BrandMarkProps) {
  const px = sizes[size];
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Portl"
      className={`items-center gap-3 ${className ?? ""}`}
    >
      <Image
        source={logo}
        style={{ width: px, height: px }}
        contentFit="contain"
        accessibilityIgnoresInvertColors
      />
      {showWordmark ? (
        <View className="items-center gap-1">
          <Text className="text-display text-ink">Portl</Text>
          {subtitle ? (
            <Text className="text-center text-body text-ink-soft">{subtitle}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
