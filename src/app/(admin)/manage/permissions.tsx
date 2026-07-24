import { Badge, Button, Card, EmptyState, QueryErrorState, Skeleton } from "@/components/ui";
import {
  AdminRoute,
  mutationFeedback,
} from "@/features/admin/adminUi";
import {
  ADMIN_CAPABILITIES,
  CAPABILITY_LABELS,
  type AdminCapability,
  useAdminCapabilityGrants,
  useSetAdminCapabilities,
} from "@/features/admin/capabilities";
import { useSessionStore } from "@/stores/session";
import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

export default function PermissionsRoute() {
  const grants = useAdminCapabilityGrants();
  const rows = grants.data ?? [];

  return (
    <AdminRoute
      title="Admin permissions"
      description="Grant granular capabilities to other admins. Leaving someone with no grants means full access."
    >
      {grants.isLoading ? <Skeleton /> : null}
      {grants.isError ? (
        <QueryErrorState
          error={grants.error}
          onRetry={() => void grants.refetch()}
          isRetrying={grants.isRefetching}
        />
      ) : null}
      {!grants.isLoading && !grants.isError && !rows.length ? (
        <EmptyState title="No admins found" />
      ) : null}
      {rows.map((row) => (
        <AdminCapabilityCard key={row.profile_id} row={row} />
      ))}
    </AdminRoute>
  );
}

function AdminCapabilityCard({
  row,
}: {
  row: { profile_id: string; name: string; capabilities: string[] };
}) {
  const me = useSessionStore((s) => s.profile?.id);
  const save = useSetAdminCapabilities();
  const isSelf = row.profile_id === me;
  const isFull = row.capabilities.includes("*");
  const initial = useMemo(
    () =>
      isFull
        ? [...ADMIN_CAPABILITIES]
        : (row.capabilities.filter((c): c is AdminCapability =>
            (ADMIN_CAPABILITIES as readonly string[]).includes(c),
          ) as AdminCapability[]),
    [isFull, row.capabilities],
  );
  const [selected, setSelected] = useState<AdminCapability[]>(initial);
  const [restrict, setRestrict] = useState(!isFull);

  const toggle = (cap: AdminCapability) => {
    setSelected((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap],
    );
  };

  return (
    <Card className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="text-label text-ink">{row.name}</Text>
        <Badge
          label={isSelf ? "You" : restrict ? "Restricted" : "Full admin"}
          tone={restrict ? "warn" : "approve"}
        />
      </View>
      {isSelf ? (
        <Text className="text-caption text-ink-muted">
          You can’t change your own grants. Ask another full admin.
        </Text>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setRestrict((v) => !v);
              if (restrict) setSelected([...ADMIN_CAPABILITIES]);
            }}
          >
            <Text className="text-caption text-primary">
              {restrict ? "Switch to full admin access" : "Limit to selected capabilities"}
            </Text>
          </Pressable>
          {restrict
            ? ADMIN_CAPABILITIES.map((cap) => {
                const on = selected.includes(cap);
                return (
                  <Pressable
                    key={cap}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() => toggle(cap)}
                    className="flex-row items-center justify-between py-1"
                  >
                    <Text className="text-body text-ink">{CAPABILITY_LABELS[cap]}</Text>
                    <Badge label={on ? "On" : "Off"} tone={on ? "approve" : "neutral"} />
                  </Pressable>
                );
              })
            : null}
          <Button
            title="Save permissions"
            loading={save.isPending}
            disabled={restrict && selected.length === 0}
            onPress={() =>
              save.mutate(
                {
                  profileId: row.profile_id,
                  capabilities: restrict ? selected : [],
                },
                mutationFeedback("Permissions saved"),
              )
            }
          />
        </>
      )}
    </Card>
  );
}
