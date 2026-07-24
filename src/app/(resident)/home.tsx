import { NotificationBell } from "@/components/NotificationBell";
import { duePayableAmount, formatMoney } from "@/lib/money";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  HeroCard,
  IconTile,
  QueryErrorState,
  Screen,
  SectionTitle,
  Skeleton,
} from "@/components/ui";
import { Countdown } from "@/components/Countdown";
import { ActiveSosBanner } from "@/features/safety/ActiveSosBanner";
import { SosButton } from "@/features/safety/SosButton";
import { useDues } from "@/features/community/hooks";
import { useMyFlatLabel } from "@/features/community/useMyFlatLabel";
import { useNotices } from "@/features/notices/hooks";
import {
  useDecide,
  useFlatApprovals,
  useMyFlatInsideNow,
} from "@/features/visitors/hooks";
import { VisitorThumb } from "@/features/visitors/VisitorThumb";
import { useSessionStore } from "@/stores/session";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "expo-router";
import React from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";

const typeLabel = {
  guest: "Guest",
  delivery: "Delivery",
  cab: "Cab",
  service: "Service",
} as const;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning,";
  if (h < 17) return "Good Afternoon,";
  return "Good Evening,";
}

export default function ResidentHome() {
  const profile = useSessionStore((s) => s.profile);
  const { data, error, isError, isLoading, isRefetching, refetch } =
    useFlatApprovals();
  const {
    data: insideNow,
    isRefetching: isInsideRefetching,
    refetch: refetchInside,
  } = useMyFlatInsideNow();
  const {
    data: dues,
    isRefetching: isDuesRefetching,
    refetch: refetchDues,
  } = useDues();
  const {
    data: notices,
    isRefetching: isNoticesRefetching,
    refetch: refetchNotices,
  } = useNotices();
  const { data: flatLabel } = useMyFlatLabel();
  const decide = useDecide();
  const router = useRouter();

  const nextDue = dues?.find(
    (d) => d.status === "due" || d.status === "claimed",
  );
  const latestNotice = notices?.[0];
  const refreshing =
    isRefetching ||
    isInsideRefetching ||
    isDuesRefetching ||
    isNoticesRefetching;

  return (
    <Screen>
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void refetch();
              void refetchInside();
              void refetchDues();
              void refetchNotices();
            }}
          />
        }
      >
        <View className="gap-4 p-4 pb-8">
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-caption text-ink-muted">{greeting()}</Text>
              <Text className="text-display text-ink">
                {profile?.name ?? "Resident"}
              </Text>
              {flatLabel ? (
                <Text className="text-caption text-ink-soft">{flatLabel}</Text>
              ) : null}
            </View>
            <View className="flex-row items-center gap-3">
              <NotificationBell href="/(resident)/inbox" />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open profile"
                onPress={() => router.push("/(resident)/profile" as any)}
              >
                <Avatar name={profile?.name} size={40} />
              </Pressable>
            </View>
          </View>

          <ActiveSosBanner />

          {nextDue ? (
            <HeroCard>
              <Text className="text-caption text-on-primary opacity-80">
                Maintenance Due
              </Text>
              <View className="flex-row items-end justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-display text-on-primary">
                    {formatMoney(duePayableAmount(nextDue))}
                  </Text>
                  <Text className="text-caption text-on-primary opacity-80">
                    {nextDue.period}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Pay now"
                  onPress={() => router.push("/(resident)/payments" as any)}
                  className="rounded-pill bg-surface px-5 py-2.5 active:opacity-80"
                >
                  <Text className="text-label text-primary">
                    {nextDue.status === "claimed" ? "View" : "Pay Now"}
                  </Text>
                </Pressable>
              </View>
            </HeroCard>
          ) : null}

          <SectionTitle>Quick actions</SectionTitle>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-3 pr-2"
          >
            <IconTile
              icon="visitors"
              label="Visitors"
              onPress={() =>
                router.push("/(resident)/pre-approvals?tab=pending" as any)
              }
            />
            <IconTile
              icon="complaints"
              label="Complaints"
              onPress={() => router.push("/(resident)/helpdesk" as any)}
            />
            <IconTile
              icon="amenities"
              label="Amenities"
              onPress={() => router.push("/(resident)/amenities" as any)}
            />
            <IconTile
              icon="polls"
              label="Polls"
              onPress={() =>
                router.push("/(resident)/community?tab=polls" as any)
              }
            />
            <IconTile
              icon="shield"
              label="Security"
              accent
              onPress={() => router.push("/(resident)/security" as any)}
            />
            <IconTile
              icon="directory"
              label="Directory"
              onPress={() => router.push("/(resident)/directory" as any)}
            />
          </ScrollView>

          <SosButton kind="sos" />

          <View className="flex-row items-center justify-between">
            <SectionTitle>Pending visitor</SectionTitle>
            {!!data?.length ? (
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push("/(resident)/pre-approvals?tab=pending" as any)
                }
              >
                <Text className="text-caption text-primary">See all</Text>
              </Pressable>
            ) : null}
          </View>

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
              title="Couldn’t load gate requests"
            />
          )}

          {!isLoading && !isError && !data?.length && (
            <EmptyState
              title="All quiet"
              hint="Visitor requests from the gate will appear here the moment a guard raises them."
              actionLabel="Refresh"
              onAction={() => void refetch()}
            />
          )}

          {data?.slice(0, 2).map((req) => (
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
                    <Text className="text-title text-ink">
                      {typeLabel[req.visitor.type]}
                    </Text>
                    <Text className="text-body text-ink-soft">
                      {req.visitor.name}
                      {req.visitor.vehicle_no
                        ? ` · ${req.visitor.vehicle_no}`
                        : ""}
                    </Text>
                    <Text className="text-caption text-ink-muted">
                      {formatDistanceToNow(new Date(req.created_at))} ago
                    </Text>
                    <Countdown createdAt={req.created_at} />
                  </View>
                  <Badge
                    label={typeLabel[req.visitor.type]}
                    tone="primary"
                  />
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
          ))}

          {latestNotice ? (
            <>
              <SectionTitle>Today’s notice</SectionTitle>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open notices"
                onPress={() =>
                  router.push("/(resident)/community?tab=notices" as any)
                }
              >
                <Card>
                  <Text className="text-label text-ink" numberOfLines={1}>
                    {latestNotice.title}
                  </Text>
                  <Text className="text-body text-ink-soft" numberOfLines={2}>
                    {latestNotice.body}
                  </Text>
                  <Text className="text-caption text-primary">
                    View all notices →
                  </Text>
                </Card>
              </Pressable>
            </>
          ) : null}

          {!!insideNow?.length && (
            <>
              <SectionTitle>Inside now</SectionTitle>
              <Card>
                {insideNow.map((log: any) => (
                  <View
                    key={log.id}
                    className="flex-row items-center justify-between"
                  >
                    <Text className="text-body text-ink">
                      {log.visitor?.name}
                    </Text>
                    <Text className="text-caption text-ink-muted">
                      in {formatDistanceToNow(new Date(log.entry_at))} ago
                    </Text>
                  </View>
                ))}
              </Card>
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
