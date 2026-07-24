import {
  AppIcon,
  Avatar,
  Badge,
  Card,
  EmptyState,
  QueryErrorState,
  Skeleton,
} from "@/components/ui";
import { useGuardsOnDuty, type GuardOnDutyRow } from "@/features/guards/hooks";
import { format } from "date-fns";
import React from "react";
import { Text, View } from "react-native";

function shiftWindow(row: GuardOnDutyRow) {
  return `${format(new Date(row.starts_at), "h:mm a")} – ${format(
    new Date(row.ends_at),
    "h:mm a",
  )}`;
}

function statusBadge(row: GuardOnDutyRow) {
  if (row.is_on_duty) return <Badge label="On duty now" tone="approve" />;
  if (row.status === "completed")
    return <Badge label="Shift ended" tone="neutral" />;
  return <Badge label="Scheduled" tone="primary" />;
}

/**
 * "Security on duty" board. Any society member can see which guard is on
 * which gate right now, driven by the guards' own check-in / check-out
 * attendance. Reused on the resident Security screen, the guard shifts
 * screen (peers) and the admin dashboard.
 */
export function GuardsOnDutyPanel() {
  const { data, isLoading, isError, error, refetch } = useGuardsOnDuty();

  if (isLoading) {
    return (
      <View className="gap-3">
        <Skeleton />
        <Skeleton />
      </View>
    );
  }

  if (isError) {
    return <QueryErrorState error={error} onRetry={() => void refetch()} />;
  }

  if (!data?.length) {
    return (
      <EmptyState
        title="No guards on shift"
        hint="When a guard checks in for their shift, they'll show up here so you always know who's at the gate."
      />
    );
  }

  return (
    <View className="gap-3">
      {data.map((row) => (
        <Card
          key={row.shift_id}
          className={row.is_on_duty ? "border-approve" : undefined}
        >
          <View className="flex-row items-center gap-3">
            <Avatar name={row.guard_name} size={44} />
            <View className="flex-1">
              <Text className="text-title text-ink" numberOfLines={1}>
                {row.guard_name}
              </Text>
              <View className="flex-row items-center gap-1.5">
                <AppIcon name="shield" size={13} />
                <Text className="text-caption text-ink-soft" numberOfLines={1}>
                  {row.gate_name ?? "Gate to be assigned"} · {shiftWindow(row)}
                </Text>
              </View>
            </View>
            {statusBadge(row)}
          </View>
          {row.handover_note ? (
            <Text className="mt-2 text-caption text-ink-muted">
              Handover: {row.handover_note}
            </Text>
          ) : null}
        </Card>
      ))}
    </View>
  );
}
