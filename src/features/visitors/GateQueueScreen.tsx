import {
  BackControl,
  Badge,
  Button,
  Card,
  EmptyState,
  Screen,
} from "@/components/ui";
import { flushGateQueue, useOfflineQueue } from "@/lib/offline";
import { scopedQueue } from "@/lib/offlineQueue";
import { useSupabase } from "@/lib/supabase";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";

const actionLabel = {
  raise_visitor: "Raise visitor request",
  mark_entry: "Mark visitor entry",
  mark_exit: "Mark visitor exit",
  retry_request: "Retry visitor request",
  decide_request: "Send resident decision",
  admin_override: "Apply admin override",
} as const;

export function GateQueueScreen() {
  const router = useRouter();
  const supabase = useSupabase();
  const items = useOfflineQueue((state) =>
    scopedQueue(state.items, state.scope),
  );
  const retry = useOfflineQueue((state) => state.retry);
  const remove = useOfflineQueue((state) => state.remove);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const retryNow = async (id: string) => {
    setRetryingId(id);
    try {
      retry(id);
      await flushGateQueue(supabase);
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 p-4">
        <BackControl label="Back to gate" onPress={() => router.back()} />
        <Text className="text-display text-ink">Offline queue</Text>
        <Text className="text-caption text-ink-muted">
          Pending actions sync in order. Permanent failures stay here for
          review and are never silently retried.
        </Text>
        {!items.length ? (
          <EmptyState title="No queued gate actions" />
        ) : (
          items.map((item) => (
            <Card key={item.id}>
              <View className="flex-row items-center justify-between gap-2">
                <Text className="flex-1 text-title text-ink">
                  {actionLabel[item.kind]}
                </Text>
                <Badge
                  label={item.status === "dead" ? "Needs review" : "Pending"}
                  tone={item.status === "dead" ? "deny" : "neutral"}
                />
              </View>
              <Text className="text-caption text-ink-muted">
                Queued {new Date(item.queuedAt).toLocaleString()} · attempts{" "}
                {item.attempts}
              </Text>
              {item.kind === "raise_visitor" ? (
                <Text className="text-body text-ink-soft">
                  {item.payload.name} · {item.payload.type}
                  {item.payload.photoUrl ? " · photo included" : ""}
                </Text>
              ) : null}
              {item.lastError ? (
                <Text className="text-caption text-deny">{item.lastError}</Text>
              ) : null}
              <View className="flex-row gap-2">
                <Button
                  title="Retry now"
                  variant="secondary"
                  className="grow"
                  loading={retryingId === item.id}
                  disabled={retryingId !== null}
                  onPress={() =>
                    void retryNow(item.id).catch((error) =>
                      Alert.alert("Retry failed", error.message),
                    )
                  }
                />
                <Button
                  title="Discard"
                  variant="ghost"
                  onPress={() =>
                    Alert.alert(
                      "Discard queued action?",
                      "This action will not be sent to the gate server.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Discard",
                          style: "destructive",
                          onPress: () => remove(item.id),
                        },
                      ],
                    )
                  }
                />
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
