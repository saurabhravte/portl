import {
  Badge,
  BackControl,
  Card,
  EmptyState,
  QueryErrorState,
  Screen,
  SectionTitle,
  Skeleton,
} from "@/components/ui";
import { useVisitorHistory, type GateLogRow } from "@/features/visitors/hooks";
import { useSessionStore } from "@/stores/session";
import { FlashList } from "@shopify/flash-list";
import { format } from "date-fns";
import React from "react";
import { ActivityIndicator, Linking, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

const typeLabel: Record<string, string> = {
  guest: "Guest",
  delivery: "Delivery",
  cab: "Cab",
  service: "Service",
};

export function VisitorHistoryScreen({
  embedded = false,
}: {
  /** When true, omit Screen chrome / back control for tab embedding. */
  embedded?: boolean;
}) {
  const role = useSessionStore((s) => s.profile?.role);
  const router = useRouter();
  const {
    data,
    error,
    isError,
    isLoading,
    isRefetching,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useVisitorHistory(30);
  const rows = data?.pages.flat() ?? [];
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else
      router.replace(
        (role === "guard" ? "/(guard)/gate" : "/(resident)/home") as any,
      );
  };

  const body = (
    <>
      {!embedded ? (
        <>
          <BackControl
            label={role === "resident" ? "Back to home" : "Back"}
            onPress={goBack}
          />
          <SectionTitle>
            {role === "resident" ? "Your flat's visitors" : "Visitor history"}
          </SectionTitle>
          <Text className="text-caption text-ink-muted">Last 30 days</Text>
        </>
      ) : (
        <Text className="text-caption text-ink-muted">Last 30 days</Text>
      )}
      {isLoading ? (
        <View className="gap-3">
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </View>
      ) : isError ? (
        <QueryErrorState
          error={error}
          onRetry={() => void refetch()}
          isRetrying={isRefetching}
          title="Couldn’t load visitor history"
        />
      ) : !rows.length ? (
        <EmptyState
          title="No visits yet"
          hint="Entries and exits recorded at the gate will show up here."
          actionLabel="Refresh"
          onAction={() => void refetch()}
        />
      ) : (
        <FlashList
          data={rows}
          refreshing={isRefetching && !isFetchingNextPage}
          onRefresh={() => void refetch()}
          keyExtractor={(item: GateLogRow) => item.id}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          ItemSeparatorComponent={() => <View className="h-3" />}
          ListFooterComponent={() =>
            isFetchingNextPage ? (
              <View className="p-4">
                <ActivityIndicator />
              </View>
            ) : (
              <View className="h-6" />
            )
          }
          renderItem={({ item }: { item: GateLogRow }) => (
            <Card>
              <View className="flex-row items-center justify-between">
                <Text className="text-label text-ink">{item.visitor.name}</Text>
                <View className="flex-row items-center gap-2">
                  {item.method === "admin_override" ? (
                    <Badge label="admin override" tone="deny" />
                  ) : null}
                  <Badge label={typeLabel[item.visitor.type] ?? item.visitor.type} />
                </View>
              </View>
              {role !== "resident" && item.visitor.flat?.number ? (
                <Text className="text-caption text-ink-muted">
                  {item.visitor.flat.tower?.name
                    ? `${item.visitor.flat.tower.name} · `
                    : ""}
                  Flat {item.visitor.flat.number}
                </Text>
              ) : null}
              {item.override_reason ? (
                <Text className="text-caption text-deny">
                  Override reason: {item.override_reason}
                </Text>
              ) : null}
              {item.visitor.phone ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Call ${item.visitor.phone}`}
                  onPress={() => Linking.openURL(`tel:${item.visitor.phone}`)}
                >
                  <Text className="text-caption text-ink underline">
                    Call {item.visitor.phone}
                  </Text>
                </Pressable>
              ) : null}
              <Text className="text-caption text-ink-faint">
                In {format(new Date(item.entry_at), "d MMM, h:mm a")}
                {item.exit_at
                  ? ` · Out ${format(new Date(item.exit_at), "d MMM, h:mm a")}`
                  : " · Still inside"}
              </Text>
            </Card>
          )}
        />
      )}
    </>
  );

  if (embedded) {
    return <View className="min-h-[420px] flex-1 gap-3">{body}</View>;
  }

  return <Screen className="gap-3 p-4">{body}</Screen>;
}
