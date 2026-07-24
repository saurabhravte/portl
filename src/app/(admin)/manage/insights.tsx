import {
  Badge,
  Card,
  EmptyState,
  QueryErrorState,
  Skeleton,
} from "@/components/ui";
import {
  AdminRoute,
  FilterChips,
} from "@/features/admin/adminUi";
import {
  HorizontalBars,
  MetricStrip,
  ProgressRing,
  TrafficHeatmap,
} from "@/features/analytics/Charts";
import { useSocietyAnalytics } from "@/features/analytics/hooks";
import { formatMoney } from "@/lib/money";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";

type WindowDays = 7 | 30 | 90;

export default function InsightsRoute() {
  const router = useRouter();
  const [days, setDays] = useState<WindowDays>(30);
  const analytics = useSocietyAnalytics(days);
  const data = analytics.data;

  return (
    <AdminRoute
      title="Insights"
      description="Visitor traffic, complaints, amenities, dues collection, poll engagement, and guard performance."
    >
      <FilterChips
        label="Window"
        value={String(days)}
        options={[
          { value: "7", label: "7 days" },
          { value: "30", label: "30 days" },
          { value: "90", label: "90 days" },
        ]}
        onChange={(v) => setDays(Number(v) as WindowDays)}
      />

      {analytics.isLoading ? <Skeleton height={160} /> : null}
      {analytics.isError ? (
        <QueryErrorState
          error={analytics.error}
          onRetry={() => void analytics.refetch()}
          isRetrying={analytics.isRefetching}
        />
      ) : null}
      {!analytics.isLoading && !analytics.isError && !data ? (
        <EmptyState title="No analytics yet" />
      ) : null}

      {data ? (
        <>
          {/* #80 Traffic heatmap */}
          <Card className="gap-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-label text-ink">Visitor traffic</Text>
              <Badge label={`${data.traffic.entries} entries`} tone="neutral" />
            </View>
            <MetricStrip
              items={[
                { label: "Entries", value: data.traffic.entries ?? 0 },
                { label: "Exits", value: data.traffic.exits ?? 0 },
                { label: "Inside now", value: data.traffic.inside_now ?? 0 },
              ]}
            />
            <TrafficHeatmap cells={data.traffic.heatmap ?? []} />
            <HorizontalBars
              data={(data.traffic.by_hour ?? []).map((h) => ({
                label: `${h.hour}:00`,
                value: h.count,
              }))}
              maxBars={12}
            />
          </Card>

          {/* Approvals (pairs with #80) */}
          <Card className="gap-2">
            <Text className="text-label text-ink">Gate approvals</Text>
            <Text className="text-display text-ink">
              {data.approvals.median_manual_seconds == null
                ? "—"
                : `${Math.round(data.approvals.median_manual_seconds)}s`}
            </Text>
            <Text className="text-caption text-ink-muted">
              median manual approval · {data.approvals.approved} approved ·{" "}
              {data.approvals.auto_approved} auto · {data.approvals.denied} denied
            </Text>
          </Card>

          {/* #81 Complaints */}
          <Card className="gap-3">
            <Text className="text-label text-ink">Complaint resolution</Text>
            <MetricStrip
              items={[
                { label: "Open", value: data.complaints.open ?? 0 },
                { label: "In progress", value: data.complaints.in_progress ?? 0 },
                { label: "Resolved", value: data.complaints.resolved ?? 0 },
                { label: "Closed", value: data.complaints.closed ?? 0 },
              ]}
            />
            <View className="flex-row items-center justify-between gap-3">
              <ProgressRing
                percent={data.complaints.sla_hit_pct}
                label="First-response SLA"
              />
              <View className="flex-1 gap-1">
                <Text className="text-caption text-ink-muted">
                  Median first response{" "}
                  {data.complaints.median_first_response_hours ?? 0}h
                </Text>
                <Text className="text-caption text-ink-muted">
                  Median resolution{" "}
                  {data.complaints.median_resolution_hours ?? 0}h
                </Text>
              </View>
            </View>
          </Card>

          {/* #82 Amenities */}
          <Card className="gap-3">
            <Text className="text-label text-ink">Amenity utilization</Text>
            <MetricStrip
              items={[
                { label: "Bookings", value: data.amenities.total_bookings ?? 0 },
                { label: "Checked in", value: data.amenities.checked_in ?? 0 },
                { label: "No-shows", value: data.amenities.no_shows ?? 0 },
              ]}
            />
            <Text className="text-caption text-ink-muted">
              Revenue {formatMoney(data.amenities.revenue)} · Penalties due{" "}
              {formatMoney(data.amenities.penalties_due)}
            </Text>
            <HorizontalBars
              data={(data.amenities.by_amenity ?? []).map((a) => ({
                label: a.amenity_name,
                value: a.bookings,
              }))}
            />
          </Card>

          {/* #83 Collection / defaulters */}
          <Card className="gap-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-label text-ink">
                Collection · {data.dues.period}
              </Text>
              <Pressable onPress={() => router.push("/(admin)/manage/dues" as never)}>
                <Text className="text-caption text-primary">Open dues →</Text>
              </Pressable>
            </View>
            <View className="flex-row items-center gap-4">
              <ProgressRing
                percent={data.dues.collection_pct}
                label="Collection"
              />
              <View className="flex-1 gap-1">
                <Text className="text-caption text-ink-muted">
                  Collected {formatMoney(data.dues.amount_collected)}
                </Text>
                <Text className="text-caption text-ink-muted">
                  Outstanding {formatMoney(data.dues.amount_outstanding)}
                </Text>
                <Text className="text-caption text-ink-muted">
                  {data.dues.outstanding} flats still due / claimed
                </Text>
              </View>
            </View>
            <Text className="text-label text-ink">Defaulters</Text>
            {(data.dues.defaulters ?? []).length === 0 ? (
              <Text className="text-caption text-ink-muted">
                No outstanding dues for this period.
              </Text>
            ) : (
              (data.dues.defaulters ?? []).slice(0, 15).map((d) => (
                <View
                  key={d.due_id}
                  className="flex-row items-center justify-between border-b border-border py-2"
                >
                  <View className="flex-1 pr-2">
                    <Text className="text-body text-ink">
                      {d.tower_name} · {d.flat_number}
                    </Text>
                    <Text className="text-caption text-ink-muted">{d.status}</Text>
                  </View>
                  <Text className="text-label text-ink">
                    {formatMoney(d.payable)}
                  </Text>
                </View>
              ))
            )}
          </Card>

          {/* #84 Polls */}
          <Card className="gap-3">
            <Text className="text-label text-ink">Poll engagement</Text>
            <MetricStrip
              items={[
                { label: "Polls", value: data.polls.poll_count ?? 0 },
                {
                  label: "Avg participation",
                  value:
                    data.polls.avg_participation_pct == null
                      ? "—"
                      : `${Math.round(data.polls.avg_participation_pct)}%`,
                },
              ]}
            />
            <HorizontalBars
              data={(data.polls.polls ?? []).map((p) => ({
                label: p.question,
                value: Math.round(Number(p.participation_pct ?? 0)),
              }))}
            />
            {(data.polls.polls ?? []).slice(0, 5).map((p) => (
              <View key={p.poll_id} className="flex-row items-center justify-between">
                <Text className="flex-1 pr-2 text-caption text-ink" numberOfLines={2}>
                  {p.question}
                </Text>
                <Badge
                  label={
                    p.quorum_met
                      ? "Quorum met"
                      : `${p.vote_count}/${p.eligible_flats}`
                  }
                  tone={p.quorum_met ? "approve" : "neutral"}
                />
              </View>
            ))}
          </Card>

          {/* #85 Guards */}
          <Card className="gap-3">
            <Text className="text-label text-ink">Guard performance</Text>
            <MetricStrip
              items={[
                {
                  label: "On duty",
                  value: data.guards.summary?.on_duty_now ?? 0,
                },
                {
                  label: "Completed",
                  value: data.guards.summary?.completed ?? 0,
                },
                { label: "Missed", value: data.guards.summary?.missed ?? 0 },
              ]}
            />
            <HorizontalBars
              data={(data.guards.by_guard ?? []).map((g) => ({
                label: g.guard_name,
                value: Math.round(Number(g.completion_pct ?? 0)),
              }))}
            />
            {(data.guards.by_guard ?? []).slice(0, 8).map((g) => (
              <View
                key={g.guard_id}
                className="flex-row items-center justify-between"
              >
                <Text className="text-body text-ink">{g.guard_name}</Text>
                <Text className="text-caption text-ink-muted">
                  {g.completed} done · {g.missed} missed ·{" "}
                  {g.completion_pct == null ? "—" : `${Math.round(g.completion_pct)}%`}
                </Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </AdminRoute>
  );
}
