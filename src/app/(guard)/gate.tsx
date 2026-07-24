import { NotificationBell } from "@/components/NotificationBell";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ActiveSosBanner } from "@/features/safety/ActiveSosBanner";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  QueryErrorState,
  Screen,
  SectionTitle,
  Skeleton,
} from "@/components/ui";
import {
  type GateRequestRow,
  useGateActions,
  useGateBoard,
  useRetryRequest,
} from "@/features/visitors/hooks";
import { openCctvFeed, useCctvCameras } from "@/features/cctv/hooks";
import {
  useGateIotDevices,
  useRequestGateOpen,
} from "@/features/iot/hooks";
import { isPastExpectedExit } from "@/features/productWorkflows/logic";
import {
  confirmSensitiveAction,
  localAuthFailureMessage,
} from "@/lib/localAuth";
import { useT } from "@/lib/i18n";
import { reportMutationError } from "@/lib/queryState";
import { formatDistanceToNow, format } from "date-fns";
import React, { useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";

export default function Gate() {
  const t = useT();
  const {
    data,
    error,
    isError,
    isLoading,
    isRefetching,
    refetch,
  } = useGateBoard();
  const { markEntry, markExit } = useGateActions();
  const retry = useRetryRequest();
  const cameras = useCctvCameras();
  const iotDevices = useGateIotDevices();
  const requestOpen = useRequestGateOpen();
  const [unlockReason, setUnlockReason] = useState("");

  const statusBadge = (req: GateRequestRow) => {
    if (req.status === "expired")
      return { label: t("expired"), tone: "deny" as const };
    if (req.status === "approved")
      return {
        label: req.decided_by == null ? t("auto") : t("approved"),
        tone: "approve" as const,
      };
    if (req.status === "denied")
      return { label: "Denied", tone: "deny" as const };
    return { label: t("waiting"), tone: "neutral" as const };
  };

  const onMarkEntry = (requestId: string) =>
    markEntry.mutate(
      { requestId },
      {
        onSuccess: (r) => {
          if (r?.queued) Alert.alert(t("queued_title"), t("queued_hint"));
        },
        onError: (error) =>
          Alert.alert(
            "Error",
            reportMutationError("mark-visitor-entry", error, { requestId }),
          ),
      },
    );

  return (
    <Screen>
      <OfflineBanner />
      <ScrollView
        contentContainerClassName="gap-4 p-4"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
          />
        }
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-display text-ink">{t("gate")}</Text>
          <NotificationBell href="/(guard)/inbox" />
        </View>

        <ActiveSosBanner />

        {!!cameras.data?.length && (
          <>
            <SectionTitle>CCTV</SectionTitle>
            {cameras.data.map((camera) => (
              <Card key={camera.id}>
                <View className="flex-row items-center justify-between">
                  <Text className="text-title text-ink">{camera.name}</Text>
                  <Badge label={camera.stream_kind.toUpperCase()} />
                </View>
                <Text className="text-caption text-ink-muted">
                  {camera.gate?.name ?? "Society camera"}
                </Text>
                <Button
                  title="Open feed"
                  variant="secondary"
                  size="sm"
                  onPress={() =>
                    void openCctvFeed(camera.stream_url).catch((err) =>
                      Alert.alert(
                        "Couldn’t open feed",
                        err instanceof Error ? err.message : "",
                      ),
                    )
                  }
                />
              </Card>
            ))}
          </>
        )}

        {!!iotDevices.data?.filter((d) => d.is_active).length && (
          <>
            <SectionTitle>Smart locks</SectionTitle>
            <Field
              label="Unlock reason"
              value={unlockReason}
              onChangeText={setUnlockReason}
              placeholder="Required to unlock"
            />
            {iotDevices.data
              .filter((d) => d.is_active)
              .map((device) => (
                <Card key={device.id}>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-title text-ink">{device.label}</Text>
                    <Badge label={device.last_status} />
                  </View>
                  <Text className="text-caption text-ink-muted">
                    {device.gate?.name ?? "Gate"} · {device.provider}
                  </Text>
                  <Button
                    title="Request unlock"
                    size="guard"
                    disabled={unlockReason.trim().length < 3}
                    loading={requestOpen.isPending}
                    onPress={async () => {
                      const auth = await confirmSensitiveAction(
                        "Confirm gate unlock",
                      );
                      if (!auth.ok) {
                        Alert.alert(
                          "Unlock blocked",
                          localAuthFailureMessage(auth),
                        );
                        return;
                      }
                      requestOpen.mutate(
                        {
                          gateId: device.gate_id,
                          reason: unlockReason.trim(),
                        },
                        {
                          onSuccess: () => {
                            setUnlockReason("");
                            Alert.alert("Unlock sent", "Command recorded and dispatched.");
                          },
                          onError: (err) =>
                            Alert.alert(
                              "Unlock failed",
                              reportMutationError("gate-open", err),
                            ),
                        },
                      );
                    }}
                  />
                </Card>
              ))}
          </>
        )}

        <SectionTitle>{t("waiting_at_gate")}</SectionTitle>
        {isLoading && <Skeleton height={96} />}
        {!isLoading && isError && (
          <QueryErrorState
            error={error}
            onRetry={() => void refetch()}
            isRetrying={isRefetching}
            title="Couldn’t load the gate board"
          />
        )}
        {!isLoading && !isError && !data?.pending.length && (
          <EmptyState
            title={t("gate_clear")}
            hint={t("gate_clear_hint")}
            actionLabel="Refresh"
            onAction={() => void refetch()}
          />
        )}
        {data?.pending.map((req) => {
          const b = statusBadge(req);
          return (
            <Card key={req.id}>
              <View className="flex-row items-center justify-between">
                <Text className="text-title text-ink">{req.visitor.name}</Text>
                <Badge label={b.label} tone={b.tone} />
              </View>
              <Text className="text-body text-ink-soft">
                {t("flat")} {req.visitor.flat?.number ?? "—"} · {req.visitor.type}
                {req.visitor.vehicle_no ? ` · ${req.visitor.vehicle_no}` : ""} ·{" "}
                {formatDistanceToNow(new Date(req.created_at))} ago
              </Text>
              {req.status === "approved" && (
                <Button
                  title={t("mark_entry")}
                  size="guard"
                  loading={markEntry.isPending}
                  onPress={() => onMarkEntry(req.id)}
                />
              )}
              {req.status === "expired" && (
                <Button
                  title={`↻ ${t("retry")}`}
                  size="guard"
                  variant="secondary"
                  loading={retry.isPending}
                  onPress={() =>
                    retry.mutate(
                      { visitorId: req.visitor.id },
                      {
                        onSuccess: (result) => {
                          if (result?.queued)
                            Alert.alert(t("queued_title"), t("queued_hint"));
                        },
                        onError: (error) =>
                          Alert.alert(
                            "Retry failed",
                            reportMutationError("retry-visitor-request", error),
                          ),
                      },
                    )
                  }
                />
              )}
              {req.status === "denied" ? (
                <Text className="text-caption text-deny">
                  Resident denied entry. Do not admit without an audited admin override.
                </Text>
              ) : null}
            </Card>
          );
        })}

        {!!data?.expected?.length && (
          <>
            <SectionTitle>{t("expected_today")}</SectionTitle>
            {data.expected.map((p) => (
              <Card key={p.id}>
                <View className="flex-row items-center justify-between">
                  <Text className="text-title text-ink">{p.visitor_name}</Text>
                  <Badge label={p.type} />
                </View>
                <Text className="text-caption text-ink-muted">
                  {t("flat")} {p.flat?.number ?? "—"} · until{" "}
                  {format(new Date(p.valid_to), "h:mm a")}
                </Text>
              </Card>
            ))}
          </>
        )}

        <View className="flex-row items-center justify-between">
          <SectionTitle>{t("inside_now")}</SectionTitle>
          {!!data?.inside.length ? (
            <Button
              title="Share roster"
              variant="ghost"
              onPress={() =>
                Share.share({
                  title: "Current gate occupancy",
                  message: [
                    `Current occupancy · ${format(new Date(), "d MMM, h:mm a")}`,
                    ...data.inside.map(
                      (log, index) =>
                        `${index + 1}. ${log.visitor.name} · Flat ${log.visitor.flat?.number ?? "—"} · entered ${format(new Date(log.entry_at), "h:mm a")}${isPastExpectedExit(log.expected_exit_at) ? " · OVERSTAYING" : ""}`,
                    ),
                  ].join("\n"),
                })
              }
            />
          ) : null}
        </View>
        {!data?.inside.length && <EmptyState title={t("nobody_inside")} />}
        {data?.inside.map((log) => (
          <Card key={log.id}>
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="text-title text-ink">{log.visitor.name}</Text>
                  {log.method === "admin_override" ? (
                    <Badge label={t("admin_override")} tone="deny" />
                  ) : null}
                  {isPastExpectedExit(log.expected_exit_at) ? (
                    <Badge label="Overstaying" tone="deny" />
                  ) : null}
                </View>
                <Text className="text-caption text-ink-muted">
                  {t("flat")} {log.visitor.flat?.number ?? "—"} · in{" "}
                  {formatDistanceToNow(new Date(log.entry_at))} ago
                </Text>
              </View>
              <Button
                title={t("mark_exit")}
                variant="secondary"
                loading={markExit.isPending}
                onPress={() =>
                  Alert.alert(
                    `Mark ${log.visitor.name} as exited?`,
                    "This closes the current gate visit.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: t("mark_exit"),
                        style: "destructive",
                        onPress: () =>
                          markExit.mutate(
                            { logId: log.id },
                            {
                              onSuccess: (r) => {
                                if (r?.queued)
                                  Alert.alert(t("queued_title"), t("queued_hint"));
                              },
                              onError: (error) =>
                                Alert.alert(
                                  "Exit failed",
                                  reportMutationError("mark-visitor-exit", error, {
                                    logId: log.id,
                                  }),
                                ),
                            },
                          ),
                      },
                    ],
                  )
                }
              />
            </View>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
