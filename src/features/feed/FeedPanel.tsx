import {
  Badge,
  Card,
  EmptyState,
  QueryErrorState,
  Skeleton,
} from "@/components/ui";
import { useSupabase } from "@/lib/supabase";
import { useSessionStore } from "@/stores/session";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";

export interface ActivityRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  created_at: string;
}

function useSocietyActivity() {
  const supabase = useSupabase();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  return useQuery({
    queryKey: ["society-activity", societyId],
    enabled: !!societyId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("society_activity")
        .select("id,kind,title,body,url,created_at")
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return data as unknown as ActivityRow[];
    },
  });
}

const KIND_TONE: Record<string, "approve" | "deny" | "neutral" | "ink"> = {
  notice: "ink",
  poll: "approve",
  lost_found: "deny",
  marketplace: "neutral",
  carpool: "approve",
  event: "ink",
};

export function FeedPanel() {
  const feed = useSocietyActivity();
  const router = useRouter();

  if (feed.isLoading) return <Skeleton />;
  if (feed.isError)
    return (
      <QueryErrorState
        error={feed.error}
        onRetry={() => void feed.refetch()}
        isRetrying={feed.isRefetching}
      />
    );
  if (!feed.data?.length)
    return (
      <EmptyState
        title="No activity yet"
        hint="Notices, polls, events, and neighbour posts will show up here."
      />
    );

  return (
    <>
      {feed.data.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          onPress={() => {
            if (item.url) router.push(item.url as never);
          }}
        >
          <Card className="gap-1">
            <View className="flex-row items-center justify-between">
              <Badge
                label={item.kind.replace("_", " ")}
                tone={KIND_TONE[item.kind] ?? "neutral"}
              />
              <Text className="text-caption text-ink-muted">
                {formatDistanceToNow(new Date(item.created_at))} ago
              </Text>
            </View>
            <Text className="text-title text-ink">{item.title}</Text>
            {item.body ? (
              <Text className="text-body text-ink-soft" numberOfLines={2}>
                {item.body}
              </Text>
            ) : null}
          </Card>
        </Pressable>
      ))}
    </>
  );
}
