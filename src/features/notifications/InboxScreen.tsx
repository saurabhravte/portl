import {
  Badge,
  BackControl,
  Button,
  Card,
  EmptyState,
  QueryErrorState,
  Screen,
  SectionTitle,
  Skeleton,
} from "@/components/ui";
import {
  useMarkAllRead,
  useMarkRead,
  useNotifications,
} from "@/features/notifications/hooks";
import { FlashList } from "@shopify/flash-list";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "expo-router";
import { useSessionStore } from "@/stores/session";
import React from "react";
import { Alert, Pressable, Text, View } from "react-native";

const typeLabel: Record<string, string> = {
  visitor_request: "Gate",
  visitor_decision: "Gate",
  notice: "Notice",
  ticket_new: "Complaint",
  ticket_update: "Helpdesk",
  poll: "Poll",
  dues: "Dues",
};

export function InboxScreen() {
  const {
    data,
    error,
    isError,
    isLoading,
    isRefetching,
    refetch,
  } = useNotifications();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const router = useRouter();
  const role = useSessionStore((s) => s.profile?.role);
  const unread = data?.filter((n) => !n.read_at).length ?? 0;
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else
      router.replace(
        (role === "guard" ? "/(guard)/profile" : "/(resident)/profile") as any,
      );
  };

  return (
    <Screen className="gap-3 p-4">
      <BackControl label="Back" onPress={goBack} />
      <View className="flex-row items-center justify-between">
        <SectionTitle>Inbox</SectionTitle>
        {unread > 0 ? (
          <Button
            title="Mark all read"
            variant="ghost"
            loading={markAll.isPending}
            onPress={() =>
              markAll.mutate(undefined, {
                onError: (error) =>
                  Alert.alert(
                    "Couldn’t mark notifications read",
                    error instanceof Error ? error.message : "Please try again.",
                  ),
              })
            }
          />
        ) : null}
      </View>

      {isLoading ? (
        <View className="gap-3">
          <Skeleton />
          <Skeleton />
        </View>
      ) : isError ? (
        <QueryErrorState
          error={error}
          onRetry={() => void refetch()}
          isRetrying={isRefetching}
          title="Couldn’t load notifications"
        />
      ) : !data?.length ? (
        <EmptyState
          title="No notifications"
          hint="Visitor requests, notices, tickets and dues show up here."
          actionLabel="Refresh"
          onAction={() => void refetch()}
        />
      ) : (
        <FlashList
          data={data}
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View className="h-3" />}
          ListFooterComponent={() => <View className="h-8" />}
          renderItem={({ item }) => {
            const unreadItem = !item.read_at;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${unreadItem ? "Unread " : ""}${item.payload?.title ?? "Notification"}`}
                accessibilityState={{ selected: unreadItem }}
                disabled={markRead.isPending}
                onPress={() => {
                  if (unreadItem)
                    markRead.mutate(
                      { id: item.id },
                      {
                        onError: (error) =>
                          Alert.alert(
                            "Couldn’t mark notification read",
                            error instanceof Error
                              ? error.message
                              : "Please try again.",
                          ),
                      },
                    );
                  const url = item.payload?.url;
                  if (url) router.push(url as any);
                }}
              >
                <Card
                  className={
                    unreadItem
                      ? "border-ink opacity-100"
                      : "border-border opacity-75"
                  }
                >
                  <View className="flex-row items-center justify-between">
                    <Badge
                      label={typeLabel[item.type] ?? item.type}
                      tone={unreadItem ? "ink" : "neutral"}
                    />
                    <Text className="text-caption text-ink-muted">
                      {formatDistanceToNow(new Date(item.created_at))} ago
                    </Text>
                  </View>
                  <Text className="text-label text-ink">
                    {item.payload?.title ?? "Notification"}
                  </Text>
                  {item.payload?.body ? (
                    <Text className="text-body text-ink-soft">
                      {item.payload.body}
                    </Text>
                  ) : null}
                </Card>
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}
