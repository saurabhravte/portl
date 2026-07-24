import { AppIcon } from "@/components/ui";
import { useUnreadCount } from "@/features/notifications/hooks";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";

/** Bell that opens the role inbox. Drop on home / gate / dashboard. */
export function NotificationBell({ href }: { href: string }) {
  const count = useUnreadCount();
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Notifications${count ? `, ${count} unread` : ""}`}
      onPress={() => router.push(href as any)}
      className="h-11 w-11 items-center justify-center rounded-pill bg-surface-alt"
    >
      <AppIcon name={count ? "bell-active" : "bell"} size={22} />
      {count > 0 ? (
        <View className="absolute right-1 top-1 min-w-4.5 items-center justify-center rounded-pill bg-deny px-1 h-4.5">
          <Text className="text-[10px] font-medium text-inverse">
            {count > 9 ? "9+" : count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
