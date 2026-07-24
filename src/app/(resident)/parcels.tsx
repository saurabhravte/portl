import {
  BackControl,
  Badge,
  Button,
  Card,
  EmptyState,
  Screen,
  Skeleton,
} from "@/components/ui";
import { useMarkParcelCollected, useParcels } from "@/features/parcels/hooks";
import { format } from "date-fns";
import { useRouter } from "expo-router";
import React from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

export default function ResidentParcels() {
  const router = useRouter();
  const { data, isLoading, isRefetching, refetch } = useParcels("mine");
  const collect = useMarkParcelCollected();

  return (
    <Screen>
      <ScrollView
        contentContainerClassName="gap-3 p-4 pb-8"
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
        }
      >
        <BackControl onPress={() => router.back()} />
        <Text className="text-display text-ink">Packages</Text>
        {isLoading ? <Skeleton /> : null}
        {!isLoading && !data?.length ? (
          <EmptyState
            title="No packages"
            hint="When a guard logs a delivery held at the gate, it shows up here."
          />
        ) : null}
        {data?.map((p) => (
          <Card key={p.id}>
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-title text-ink">{p.description}</Text>
                <Text className="text-caption text-ink-soft">
                  {p.shelf_label ? `Shelf ${p.shelf_label} · ` : ""}
                  {format(new Date(p.created_at), "d MMM, h:mm a")}
                </Text>
              </View>
              <Badge
                label={p.status === "collected" ? "Collected" : "At gate"}
                tone={p.status === "collected" ? "neutral" : "warn"}
              />
            </View>
            {p.status === "pending" ? (
              <Button
                title="Mark collected"
                size="sm"
                variant="secondary"
                loading={collect.isPending}
                onPress={() => collect.mutate(p.id)}
              />
            ) : null}
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
