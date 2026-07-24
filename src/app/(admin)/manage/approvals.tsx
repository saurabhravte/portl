import { Card, QueryErrorState, Skeleton } from "@/components/ui";
import {
  AdminRoute,
  FilterChips,
  mutationFeedback,
} from "@/features/admin/adminUi";
import {
  useSocietySettings,
  useUpdateAutoApproveTypes,
  VISITOR_TYPES,
} from "@/features/admin/hooks";
import type { VisitorType } from "@/features/visitors/hooks";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";

const LABELS: Record<VisitorType, string> = {
  guest: "Guest",
  delivery: "Delivery",
  cab: "Cab",
  service: "Service",
};

type PolicyFilter = "all" | "automatic" | "manual";

export default function ApprovalsRoute() {
  const settings = useSocietySettings();
  const update = useUpdateAutoApproveTypes();
  const [filter, setFilter] = useState<PolicyFilter>("all");
  const enabled = new Set(settings.data?.autoApproveTypes ?? []);
  const visible = VISITOR_TYPES.filter(
    (type) =>
      filter === "all" ||
      (filter === "automatic" ? enabled.has(type) : !enabled.has(type)),
  );

  return (
    <AdminRoute
      title="Gate approvals"
      description="Automatic types can enter without waiting for a resident. Flats may still opt out where supported."
    >
      <FilterChips
        label="Policy"
        value={filter}
        options={[
          { value: "all", label: "All" },
          { value: "automatic", label: "Automatic" },
          { value: "manual", label: "Manual" },
        ]}
        onChange={setFilter}
      />
      {settings.isLoading ? <Skeleton /> : null}
      {settings.isError ? (
        <QueryErrorState
          error={settings.error}
          onRetry={() => void settings.refetch()}
          isRetrying={settings.isRefetching}
        />
      ) : null}
      {visible.map((type) => {
        const automatic = enabled.has(type);
        return (
          <Card key={type}>
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-label text-ink">{LABELS[type]}</Text>
                <Text className="text-caption text-ink-muted">
                  {automatic ? "Approved automatically at the gate" : "Resident approval required"}
                </Text>
              </View>
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel={`Automatic approval for ${LABELS[type]}`}
                accessibilityState={{ checked: automatic, disabled: update.isPending }}
                disabled={update.isPending}
                onPress={() => {
                  const next = automatic
                    ? (settings.data?.autoApproveTypes ?? []).filter((value) => value !== type)
                    : [...(settings.data?.autoApproveTypes ?? []), type];
                  update.mutate(
                    next,
                    mutationFeedback(
                      `Automatic approval ${automatic ? "disabled" : "enabled"} for ${LABELS[type]}`,
                    ),
                  );
                }}
                className={`min-h-11 min-w-20 items-center justify-center rounded-pill px-3 ${
                  automatic ? "bg-ink" : "bg-surface-alt"
                }`}
              >
                <Text className={`text-caption ${automatic ? "text-inverse" : "text-ink-soft"}`}>
                  {automatic ? "On" : "Off"}
                </Text>
              </Pressable>
            </View>
          </Card>
        );
      })}
    </AdminRoute>
  );
}
