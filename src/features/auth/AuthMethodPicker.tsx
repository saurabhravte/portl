import type { IdentityType } from "@/features/auth/identity";
import { Pressable, Text, View } from "react-native";

export function AuthMethodPicker({
  value,
  onChange,
  disabled,
}: {
  value: IdentityType;
  onChange: (value: IdentityType) => void;
  disabled?: boolean;
}) {
  return (
    <View
      accessibilityRole="tablist"
      className="flex-row rounded-md bg-surface-alt p-1"
    >
      {(["phone", "email"] as const).map((method) => {
        const selected = value === method;
        return (
          <Pressable
            key={method}
            accessibilityRole="tab"
            accessibilityLabel={method === "phone" ? "Phone" : "Email"}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(method)}
            className={`min-h-11 flex-1 items-center justify-center rounded-md ${
              selected ? "bg-surface" : "bg-transparent"
            }`}
          >
            <Text
              className={`text-label ${
                selected ? "text-ink" : "text-ink-muted"
              }`}
            >
              {method === "phone" ? "Phone" : "Email"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
