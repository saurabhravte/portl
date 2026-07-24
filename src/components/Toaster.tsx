import { AppIcon, type AppIconName } from "@/components/ui";
import { useToastStore, type ToastTone } from "@/stores/toast";
import { useThemeColors } from "@/theme/useThemeColors";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const toneStyle: Record<
  ToastTone,
  { wrap: string; icon: AppIconName; iconColor: (c: ReturnType<typeof useThemeColors>) => string }
> = {
  success: { wrap: "bg-approve-bg border-approve", icon: "check-circle", iconColor: (c) => c.approve },
  error: { wrap: "bg-deny-bg border-deny", icon: "alert", iconColor: (c) => c.deny },
  info: { wrap: "bg-primary-soft border-primary", icon: "bell", iconColor: (c) => c.primary },
};

/** App-wide toast host. Mount once near the root. */
export function Toaster() {
  const items = useToastStore((s) => s.items);
  const dismiss = useToastStore((s) => s.dismiss);
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  if (!items.length) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 16 }}
      className="items-center gap-2 px-4"
    >
      {items.map((t) => {
        const s = toneStyle[t.tone];
        return (
          <Pressable
            key={t.id}
            onPress={() => dismiss(t.id)}
            accessibilityRole="alert"
            className={`w-full max-w-md flex-row items-center gap-3 rounded-md border px-4 py-3 ${s.wrap}`}
          >
            <AppIcon name={s.icon} size={20} color={s.iconColor(colors)} />
            <Text className="flex-1 text-label text-ink">{t.message}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
