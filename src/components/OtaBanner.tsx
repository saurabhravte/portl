import { Button } from "@/components/ui";
import { useOtaUpdateCheck } from "@/lib/ota";
import React from "react";
import { Text, View } from "react-native";

/** Non-blocking banner when an OTA update has been downloaded. */
export function OtaBanner() {
  const { ready, applying, checking, error, apply, retry } = useOtaUpdateCheck();
  if (!ready && !error) return null;

  return (
    <View className="border-b border-border bg-surface-alt px-4 py-3">
      <Text className="text-label text-ink">
        {ready ? "A new Portl update is ready" : "Update check failed"}
      </Text>
      <Text className="mb-2 text-caption text-ink-muted">
        {ready ? "Restart to apply the over-the-air update." : error}
      </Text>
      <Button
        title={ready ? "Restart now" : "Retry update check"}
        loading={ready ? applying : checking}
        onPress={() => void (ready ? apply() : retry())}
      />
    </View>
  );
}
