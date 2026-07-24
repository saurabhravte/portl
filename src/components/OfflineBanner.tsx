import { useT, usePrefs } from "@/lib/i18n";
import { useIsOnline, useOfflineQueue } from "@/lib/offline";
import { scopedQueue } from "@/lib/offlineQueue";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";

/**
 * Persistent status banner for guard screens: NetInfo offline state with
 * the number of queued gate actions (sprint ticket #5), plus the training
 * mode indicator (ticket #17).
 */
export function OfflineBanner() {
  const online = useIsOnline();
  const queued = useOfflineQueue((s) => scopedQueue(s.items, s.scope).length);
  const training = usePrefs((s) => s.trainingMode);
  const router = useRouter();
  const t = useT();

  if (training) {
    return (
      <View className="bg-ink px-4 py-2">
        <Text className="text-center text-caption text-inverse">
          🎓 {t("training_on")}
        </Text>
      </View>
    );
  }
  if (online && queued === 0) return null;

  return (
    <Pressable
      accessibilityRole={queued ? "button" : undefined}
      accessibilityLabel={queued ? `Inspect ${queued} queued gate actions` : undefined}
      disabled={!queued}
      onPress={() => router.push("/(guard)/queue" as any)}
      className={`px-4 py-2 ${online ? "bg-approve" : "bg-deny"}`}
    >
      <Text className="text-center text-caption text-inverse">
        {online
          ? `Back online — syncing ${queued} ${t("queued_actions")}…`
          : `📶 ${t("offline_banner")}${queued ? ` · ${queued} ${t("queued_actions")}` : ""}`}
      </Text>
      {queued ? (
        <Text className="text-center text-caption text-inverse underline">
          Inspect queue
        </Text>
      ) : null}
    </Pressable>
  );
}
