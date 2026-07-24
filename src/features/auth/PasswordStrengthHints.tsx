import { AppIcon } from "@/components/ui";
import { useThemeColors } from "@/theme/useThemeColors";
import { getPasswordStrength } from "@/lib/validation";
import React from "react";
import { Text, View } from "react-native";

/** Live checklist that tells the user what a strong password still needs. */
export function PasswordStrengthHints({ password }: { password: string }) {
  const colors = useThemeColors();
  const { rules, isStrong } = getPasswordStrength(password);

  if (!password) {
    return (
      <Text className="text-caption text-ink-muted">
        Use a strong password: 8+ characters with upper, lower, number, and
        special character.
      </Text>
    );
  }

  return (
    <View className="gap-1.5 rounded-md border border-border bg-surface-alt p-3">
      <Text
        className={`text-caption font-semibold ${
          isStrong ? "text-approve" : "text-ink-soft"
        }`}
      >
        {isStrong
          ? "Strong password — you're good to go"
          : "Password must meet all rules"}
      </Text>
      {rules.map((rule) => (
        <View key={rule.key} className="flex-row items-center gap-2">
          <AppIcon
            name={rule.ok ? "check-circle" : "close"}
            size={14}
            color={rule.ok ? colors.approve : colors.inkFaint}
          />
          <Text
            className={`text-caption ${
              rule.ok ? "text-approve" : "text-ink-muted"
            }`}
          >
            {rule.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
