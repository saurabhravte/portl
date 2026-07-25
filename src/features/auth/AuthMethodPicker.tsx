import type { IdentityType } from "@/features/auth/identity";
import { Pressable, Text, View } from "react-native";

export function AuthMethodPicker({
  value,
  onChange,
  disabled,
  variant = "segmented",
  disabledMethods,
}: {
  value: IdentityType;
  onChange: (value: IdentityType) => void;
  disabled?: boolean;
  variant?: "segmented" | "underline";
  disabledMethods?: IdentityType[];
}) {
  const methods = ["email", "phone"] as const;

  if (variant === "underline") {
    return (
      <View accessibilityRole="tablist" className="flex-row border-b border-border">
        {methods.map((method) => {
          const selected = value === method;
          const methodDisabled =
            disabled || disabledMethods?.includes(method) === true;
          return (
            <Pressable
              key={method}
              accessibilityRole="tab"
              accessibilityLabel={
                method === "phone" ? "Phone number" : "Email"
              }
              accessibilityState={{ selected, disabled: methodDisabled }}
              disabled={methodDisabled}
              onPress={() => onChange(method)}
              className={`min-h-11 flex-1 items-center justify-center border-b-2 ${
                selected ? "border-ink" : "border-transparent"
              } ${methodDisabled ? "opacity-40" : "active:opacity-70"}`}
            >
              <Text
                className={`text-label ${
                  selected ? "font-semibold text-ink" : "text-ink-muted"
                }`}
              >
                {method === "phone" ? "Phone number" : "Email"}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View
      accessibilityRole="tablist"
      className="flex-row rounded-md bg-surface-alt p-1"
    >
      {methods.map((method) => {
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
