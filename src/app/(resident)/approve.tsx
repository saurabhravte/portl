import { Countdown } from "@/components/Countdown";
import { PrivateMediaImage } from "@/components/PrivateMediaImage";
import {
  AppIcon,
  BackControl,
  Badge,
  Button,
  Card,
  QueryErrorState,
  Screen,
  Skeleton,
} from "@/components/ui";
import { useDecide, useVisitorRequest } from "@/features/visitors/hooks";
import { useSetRequestHandling } from "@/features/visitors/insights";
import { VisitorTimeline } from "@/features/visitors/VisitorTimeline";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Alert, Linking, Pressable, Text, View } from "react-native";

const typeLabel = {
  guest: "Guest",
  delivery: "Delivery",
  cab: "Cab",
  service: "Service",
} as const;

/**
 * Full-screen approval — the screen a resident lands on when they tap the
 * push notification (review §5.3 "notification tap lands on home").
 * Deep link: /(resident)/approve?requestId=<uuid>
 */
export default function ApproveScreen() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const {
    data: req,
    error,
    isError,
    isLoading,
    isRefetching,
    refetch,
  } = useVisitorRequest(requestId);
  const decide = useDecide();
  const setHandling = useSetRequestHandling();
  const router = useRouter();

  const done = () => router.replace("/(resident)/home" as any);

  const decidedTone =
    req?.status === "approved"
      ? "approve"
      : req?.status === "denied"
        ? "deny"
        : "neutral";

  return (
    <Screen>
      <View className="flex-1 gap-4 p-4">
        <BackControl label="Back to home" onPress={done} />

        {isLoading && (
          <>
            <Skeleton />
            <Skeleton />
          </>
        )}

        {!isLoading && isError && (
          <QueryErrorState
            error={error}
            onRetry={() => void refetch()}
            isRetrying={isRefetching}
            title="Couldn’t load this request"
          />
        )}

        {!isLoading && !isError && !req && (
          <Card>
            <Text className="text-title text-ink">Request not found</Text>
            <Text className="text-caption text-ink-muted">
              It may have been handled already or expired.
            </Text>
            <Button title="Go home" onPress={done} className="mt-2" />
          </Card>
        )}

        {req && (
          <>
            {req.visitor.photo_url ? (
              <PrivateMediaImage
                reference={req.visitor.photo_url}
                className="h-64 w-full rounded-lg bg-surface-alt"
                contentFit="cover"
              />
            ) : (
              <View className="h-40 w-full items-center justify-center rounded-lg bg-surface-alt">
                <AppIcon
                  name="person"
                  size={44}
                  color="#6F7387"
                />
                <Text className="text-caption text-ink-muted">No photo</Text>
              </View>
            )}

            <View className="flex-row items-center justify-between">
              <Text className="text-display text-ink">{req.visitor.name}</Text>
              <Badge label={typeLabel[req.visitor.type]} />
            </View>

            {req.visitor.flat && (
              <Text className="text-body text-ink-soft">
                For {req.visitor.flat.tower?.name ?? ""} {req.visitor.flat.number}
              </Text>
            )}

            {req.visitor.vehicle_no ? (
              <Text className="text-caption text-ink-muted">
                Vehicle: {req.visitor.vehicle_no}
              </Text>
            ) : null}

            {req.visitor.phone ? (
              <Pressable
                onPress={() => Linking.openURL(`tel:${req.visitor.phone}`)}
              >
                <Text className="text-caption text-ink underline">
                  Call {req.visitor.phone}
                </Text>
              </Pressable>
            ) : null}

            {req.status === "pending" ? (
              <>
                <Countdown createdAt={req.created_at} />
                {req.visitor.type === "delivery" ? (
                  <Button
                    title="Approve & leave at gate"
                    variant="secondary"
                    size="guard"
                    loading={decide.isPending || setHandling.isPending}
                    onPress={() =>
                      decide.mutate(
                        { requestId: req.id, decision: "approved" },
                        {
                          onSuccess: () =>
                            setHandling.mutate(
                              { requestId: req.id, handling: "leave_at_gate" },
                              {
                                onSettled: done,
                                onError: done,
                              },
                            ),
                        },
                      )
                    }
                  />
                ) : null}
                <View className="mt-auto flex-row gap-3 pb-4">
                  <Button
                    title="Deny"
                    variant="deny"
                    size="guard"
                    className="grow"
                    loading={decide.isPending}
                    onPress={() =>
                      Alert.alert(
                        `Deny ${req.visitor.name}?`,
                        "The guard will be told not to admit this visitor.",
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Deny",
                            style: "destructive",
                            onPress: () =>
                              decide.mutate(
                                { requestId: req.id, decision: "denied" },
                                { onSuccess: done },
                              ),
                          },
                        ],
                      )
                    }
                  />
                  <Button
                    title="Approve"
                    variant="approve"
                    size="guard"
                    className="grow"
                    loading={decide.isPending}
                    onPress={() =>
                      decide.mutate(
                        { requestId: req.id, decision: "approved" },
                        { onSuccess: done },
                      )
                    }
                  />
                </View>
              </>
            ) : (
              <Card>
                <View className="flex-row items-center gap-2">
                  <Badge label={req.status} tone={decidedTone as any} />
                  <Text className="text-body text-ink-soft">
                    This request has already been {req.status}.
                  </Text>
                </View>
                {(req as any).handling === "leave_at_gate" ? (
                  <Text className="text-caption text-ink-muted">
                    You asked the guard to leave this at the gate.
                  </Text>
                ) : null}
                <VisitorTimeline
                  createdAt={req.created_at}
                  status={req.status}
                  decidedAt={(req as any).decided_at}
                  handling={(req as any).handling}
                />
                <Button title="Go home" onPress={done} className="mt-2" />
              </Card>
            )}
          </>
        )}
      </View>
    </Screen>
  );
}
