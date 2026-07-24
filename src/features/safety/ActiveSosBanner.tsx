import { Badge, Button } from "@/components/ui";
import {
  useActiveSosAlerts,
  useResolveSos,
  type SosAlertRow,
} from "@/features/safety/hooks";
import { formatDistanceToNow } from "date-fns";
import React from "react";
import { Text, View } from "react-native";

function raiserLabel(row: SosAlertRow) {
  const name = row.raiser?.name ?? "A member";
  const flat = row.flat?.number ? ` · Flat ${row.flat.number}` : "";
  return `${name}${flat}`;
}

/**
 * Loud, unmissable banner of active SOS/panic alerts. Renders nothing when
 * there is nothing to respond to, so it's safe to drop onto guard and admin
 * home surfaces.
 */
export function ActiveSosBanner() {
  const { data } = useActiveSosAlerts();
  const resolve = useResolveSos();

  if (!data?.length) return null;

  return (
    <View className="gap-2 rounded-lg border border-deny bg-deny-bg p-4">
      <View className="flex-row items-center gap-2">
        <Badge label={`${data.length} active`} tone="deny" />
        <Text className="text-title text-deny">Emergency alerts</Text>
      </View>
      {data.map((row) => (
        <View
          key={row.id}
          className="flex-row items-center justify-between gap-3 rounded-md bg-surface p-3"
        >
          <View className="flex-1">
            <Text className="text-label text-ink">
              {row.kind === "panic" ? "Guard panic" : "Resident SOS"} ·{" "}
              {raiserLabel(row)}
            </Text>
            {row.note ? (
              <Text className="text-caption text-ink-soft">{row.note}</Text>
            ) : null}
            <Text className="text-caption text-ink-muted">
              {formatDistanceToNow(new Date(row.created_at), {
                addSuffix: true,
              })}
            </Text>
          </View>
          <Button
            title="Resolve"
            size="sm"
            variant="deny-outline"
            loading={resolve.isPending}
            onPress={() => resolve.mutate(row.id)}
          />
        </View>
      ))}
    </View>
  );
}
