import { Countdown } from "@/components/Countdown";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  QueryErrorState,
  Skeleton,
} from "@/components/ui";
import { useDecide, useFlatApprovals } from "@/features/visitors/hooks";
import { VisitorThumb } from "@/features/visitors/VisitorThumb";
import { format } from "date-fns";
import { useRouter } from "expo-router";
import React from "react";
import { Alert, Pressable, Text, View } from "react-native";

const typeLabel = {
  guest: "Guest",
  delivery: "Delivery",
  cab: "Cab",
  service: "Service",
} as const;

export function PendingApprovalsPanel() {
  const { data, error, isError, isLoading, isRefetching, refetch } =
    useFlatApprovals();
  const decide = useDecide();
  const router = useRouter();

  if (isLoading)
    return (
      <>
        <Skeleton />
        <Skeleton />
      </>
    );

  if (isError)
    return (
      <QueryErrorState
        error={error}
        onRetry={() => void refetch()}
        isRetrying={isRefetching}
        title="Couldn’t load gate requests"
      />
    );

  if (!data?.length)
    return (
      <EmptyState
        title="No pending requests"
        hint="When a guard raises a visitor for your flat, approve or reject them here."
        actionLabel="Refresh"
        onAction={() => void refetch()}
      />
    );

  return (
    <>
      {data.map((req) => {
        const type = typeLabel[req.visitor.type];
        const subtitle = [
          format(new Date(req.created_at), "h:mm a"),
          req.visitor.vehicle_no ? req.visitor.vehicle_no : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <Pressable
            key={req.id}
            accessibilityRole="button"
            accessibilityLabel={`Open approval request for ${req.visitor.name}`}
            onPress={() =>
              router.push(`/(resident)/approve?requestId=${req.id}` as any)
            }
          >
            <Card>
              <View className="flex-row items-center gap-3">
                <VisitorThumb
                  name={req.visitor.name}
                  photoUrl={req.visitor.photo_url}
                />
                <View className="flex-1">
                  <Text className="text-title text-ink">{type}</Text>
                  <Text className="text-body text-ink-soft">
                    {req.visitor.name}
                  </Text>
                  <Text className="text-caption text-ink-muted">{subtitle}</Text>
                  <Countdown createdAt={req.created_at} />
                </View>
                <Badge label={type} tone="primary" />
              </View>
              <View className="mt-2 flex-row gap-3">
                <Button
                  title="Reject"
                  variant="deny-outline"
                  className="grow"
                  onPress={() =>
                    Alert.alert(
                      `Reject ${req.visitor.name}?`,
                      "The guard will be told not to admit this visitor.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Reject",
                          style: "destructive",
                          onPress: () =>
                            decide.mutate({
                              requestId: req.id,
                              decision: "denied",
                            }),
                        },
                      ],
                    )
                  }
                />
                <Button
                  title="Approve"
                  variant="primary"
                  className="grow"
                  onPress={() =>
                    decide.mutate({
                      requestId: req.id,
                      decision: "approved",
                    })
                  }
                />
              </View>
            </Card>
          </Pressable>
        );
      })}
    </>
  );
}
