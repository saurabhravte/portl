import { NotificationBell } from "@/components/NotificationBell";
import { ActiveSosBanner } from "@/features/safety/ActiveSosBanner";
import {
  Badge,
  Card,
  QueryErrorState,
  Screen,
  SectionTitle,
  Skeleton,
} from "@/components/ui";
import { useApprovalStats } from "@/features/admin/hooks";
import { useAmenityUsageStats } from "@/features/community/hooks";
import { formatMoney } from "@/lib/money";
import { useSupabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="flex-1 items-center">
      <Text className="text-display text-ink">{value}</Text>
      <Text className="text-caption text-ink-muted">{label}</Text>
    </Card>
  );
}

export default function AdminDashboard() {
  const supabase = useSupabase();
  const router = useRouter();
  const { data: stats } = useApprovalStats(7);
  const { data: amenityStats } = useAmenityUsageStats(30);
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const [visitors, pending, tickets, inside] = await Promise.all([
        supabase
          .from("gate_logs")
          .select("id", { count: "exact", head: true })
          .gte("entry_at", today.toISOString()),
        supabase
          .from("visitor_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .in("status", ["open", "in_progress"]),
        supabase
          .from("gate_logs")
          .select("id", { count: "exact", head: true })
          .is("exit_at", null),
      ]);
      return {
        visitorsToday: visitors.count ?? 0,
        pending: pending.count ?? 0,
        openTickets: tickets.count ?? 0,
        inside: inside.count ?? 0,
      };
    },
    refetchInterval: 30_000,
  });

  return (
    <Screen>
      <ScrollView className="flex-1">
        <View className="gap-4 p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-display text-ink">Society overview</Text>
            <NotificationBell href="/(admin)/inbox" />
          </View>
          <ActiveSosBanner />
          <Pressable onPress={() => router.push("/(admin)/history" as any)}>
            <Text className="text-caption text-ink-muted">Visitor history →</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/(admin)/manage/insights" as any)}>
            <Text className="text-caption text-primary">Analytics & insights →</Text>
          </Pressable>
          {isLoading ? (
            <Skeleton height={120} />
          ) : isError ? (
            <QueryErrorState
              error={error}
              onRetry={() => void refetch()}
              isRetrying={isRefetching}
            />
          ) : (
            <>
              <View className="flex-row gap-3">
                <Stat label="Visitors today" value={data!.visitorsToday} />
                <Stat label="Inside now" value={data!.inside} />
              </View>
              <View className="flex-row gap-3">
                <Stat label="Pending at gate" value={data!.pending} />
                <Stat label="Open tickets" value={data!.openTickets} />
              </View>
            </>
          )}
          {/* Hero metric: median gate approval time vs the 15s target (#16). */}
          {stats ? (
            <Card>
              <View className="flex-row items-center justify-between">
                <Text className="text-label text-ink">
                  Gate approvals · last 7 days
                </Text>
                <Badge
                  label={
                    stats.median_manual_seconds == null
                      ? "no data"
                      : stats.median_manual_seconds <= 15
                        ? "on target"
                        : "above 15s target"
                  }
                  tone={
                    stats.median_manual_seconds != null &&
                    stats.median_manual_seconds <= 15
                      ? "approve"
                      : "neutral"
                  }
                />
              </View>
              <Text className="text-display text-ink">
                {stats.median_manual_seconds == null
                  ? "—"
                  : `${Math.round(stats.median_manual_seconds)}s`}
              </Text>
              <Text className="text-caption text-ink-muted">
                median resident response · {stats.approved} approved ·{" "}
                {stats.auto_approved} auto · {stats.denied} denied ·{" "}
                {stats.expired} expired
              </Text>
            </Card>
          ) : null}

          {amenityStats ? (
            <Card>
              <Text className="text-label text-ink">Amenities · last {amenityStats.days} days</Text>
              <Text className="text-display text-ink">{amenityStats.total_bookings}</Text>
              <Text className="text-caption text-ink-muted">
                {amenityStats.checked_in} checked in · {amenityStats.cancelled} cancelled ·{" "}
                {amenityStats.no_shows} no-shows · waitlist {amenityStats.waitlist_waiting}
              </Text>
              <Text className="text-caption text-ink-muted">
                Revenue {formatMoney(amenityStats.revenue)} · Penalties due{" "}
                {formatMoney(amenityStats.penalties_due)}
              </Text>
            </Card>
          ) : null}

          <SectionTitle>Manage</SectionTitle>
          <Card>
            <Text className="text-body text-ink-soft">
              Towers, flats, members, amenities, staff, dues and polls live in
              the Manage tab. New sign-ups appear under Members — link them to a
              role and flat there.
            </Text>
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}
