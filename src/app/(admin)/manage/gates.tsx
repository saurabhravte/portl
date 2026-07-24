import { Badge, Button, Card, EmptyState, Field } from "@/components/ui";
import { AdminRoute, mutationFeedback } from "@/features/admin/adminUi";
import { DateTimeField } from "@/features/admin/WorkflowFields";
import { useAdminProfilesPage } from "@/features/admin/hooks";
import {
  useGates,
  useGuardDeviceSessions,
  useGuardShifts,
  useRevokeGuardDevice,
  useSaveGate,
  useSaveGuardShift,
} from "@/features/guards/hooks";
import {
  useGateIotDevices,
  useRecentGateOpenCommands,
  useRemoveGateIotDevice,
  useRequestGateOpen,
  useSaveGateIotDevice,
} from "@/features/iot/hooks";
import {
  confirmSensitiveAction,
  localAuthFailureMessage,
} from "@/lib/localAuth";
import { useSupabase } from "@/lib/supabase";
import { useSessionStore } from "@/stores/session";
import { addHours, format } from "date-fns";
import { useState } from "react";
import { Alert, Text, View } from "react-native";

export default function GatesRoute() {
  const gates = useGates();
  const shifts = useGuardShifts();
  const sessions = useGuardDeviceSessions();
  const saveGate = useSaveGate();
  const saveShift = useSaveGuardShift();
  const revoke = useRevokeGuardDevice();
  const iotDevices = useGateIotDevices();
  const saveIot = useSaveGateIotDevice();
  const removeIot = useRemoveGateIotDevice();
  const openCommands = useRecentGateOpenCommands();
  const requestOpen = useRequestGateOpen();
  const [guardSearch, setGuardSearch] = useState("");
  const profiles = useAdminProfilesPage({
    search: guardSearch,
    filters: { role: "guard" },
    limit: 50,
  });
  const guards = profiles.data?.rows ?? [];
  const [gateName, setGateName] = useState("");
  const [guardId, setGuardId] = useState("");
  const [gateId, setGateId] = useState("");
  const [startsAt, setStartsAt] = useState(() => addHours(new Date(), 1));
  const [endsAt, setEndsAt] = useState(() => addHours(new Date(), 9));
  const [revokeReason, setRevokeReason] = useState("");
  const [iotGateId, setIotGateId] = useState("");
  const [iotLabel, setIotLabel] = useState("");
  const [iotProvider, setIotProvider] = useState<"mock" | "webhook">("mock");
  const [iotWebhook, setIotWebhook] = useState("");
  const [openReason, setOpenReason] = useState("");

  return (
    <AdminRoute title="Gates & guards" description="Manage physical gates, shifts, attendance, authorized devices, and smart locks.">
      <Card>
        <Field label="New gate name" value={gateName} onChangeText={setGateName} placeholder="Main gate" />
        <Button
          title="Add gate"
          disabled={gateName.trim().length < 2}
          loading={saveGate.isPending}
          onPress={() => saveGate.mutate({ name: gateName }, mutationFeedback("Gate added", () => setGateName("")))}
        />
      </Card>
      {gates.data?.map((gate) => (
        <Card key={gate.id}>
          <View className="flex-row items-center justify-between">
            <Text className="text-title text-ink">{gate.name}</Text>
            <Badge label={gate.is_active ? "Active" : "Inactive"} tone={gate.is_active ? "approve" : "neutral"} />
          </View>
          <Button
            title={gate.is_active ? "Deactivate gate" : "Reactivate gate"}
            variant="ghost"
            onPress={() => saveGate.mutate({ id: gate.id, name: gate.name, isActive: !gate.is_active })}
          />
        </Card>
      ))}

      <Text className="text-title text-ink">Smart locks</Text>
      <Card>
        <Text className="text-caption text-ink-muted">Select gate</Text>
        <View className="flex-row flex-wrap gap-2">
          {gates.data?.filter((gate) => gate.is_active).map((gate) => (
            <Button
              key={gate.id}
              title={gate.name}
              variant={iotGateId === gate.id ? "primary" : "ghost"}
              selected={iotGateId === gate.id}
              onPress={() => setIotGateId(gate.id)}
            />
          ))}
        </View>
        <Field label="Device label" value={iotLabel} onChangeText={setIotLabel} placeholder="Main gate lock" />
        <Text className="text-caption text-ink-muted">Provider</Text>
        <View className="flex-row flex-wrap gap-2">
          <Button title="Mock" variant={iotProvider === "mock" ? "primary" : "ghost"} selected={iotProvider === "mock"} onPress={() => setIotProvider("mock")} />
          <Button title="Webhook" variant={iotProvider === "webhook" ? "primary" : "ghost"} selected={iotProvider === "webhook"} onPress={() => setIotProvider("webhook")} />
        </View>
        {iotProvider === "webhook" ? (
          <Field label="Webhook URL" value={iotWebhook} onChangeText={setIotWebhook} placeholder="https://…" autoCapitalize="none" />
        ) : null}
        <Button
          title="Attach smart lock"
          disabled={!iotGateId || iotLabel.trim().length < 2 || (iotProvider === "webhook" && iotWebhook.trim().length < 8)}
          loading={saveIot.isPending}
          onPress={() =>
            saveIot.mutate(
              {
                gateId: iotGateId,
                label: iotLabel,
                provider: iotProvider,
                webhookUrl: iotProvider === "webhook" ? iotWebhook : undefined,
              },
              mutationFeedback("Smart lock saved", () => {
                setIotLabel("");
                setIotWebhook("");
              }),
            )
          }
        />
      </Card>
      {iotDevices.data?.map((device) => (
        <Card key={device.id}>
          <View className="flex-row items-center justify-between">
            <Text className="text-title text-ink">{device.label}</Text>
            <Badge label={device.last_status} tone={device.last_status === "unlocked" ? "approve" : device.last_status === "error" ? "deny" : "neutral"} />
          </View>
          <Text className="text-caption text-ink-muted">
            {device.gate?.name ?? "Gate"} · {device.provider} · {device.is_active ? "Active" : "Inactive"}
          </Text>
          <Field label="Open reason" value={openReason} onChangeText={setOpenReason} placeholder="Required to unlock" />
          <Button
            title="Request unlock"
            disabled={openReason.trim().length < 3 || !device.is_active}
            loading={requestOpen.isPending}
            onPress={async () => {
              const auth = await confirmSensitiveAction("Confirm gate unlock");
              if (!auth.ok) {
                Alert.alert("Unlock blocked", localAuthFailureMessage(auth));
                return;
              }
              requestOpen.mutate(
                { gateId: device.gate_id, reason: openReason.trim() },
                mutationFeedback("Unlock requested", () => setOpenReason("")),
              );
            }}
          />
          <Button
            title="Remove device"
            variant="deny"
            loading={removeIot.isPending}
            onPress={() => removeIot.mutate(device.id, mutationFeedback("Device removed"))}
          />
        </Card>
      ))}
      {openCommands.data?.length ? (
        <>
          <Text className="text-title text-ink">Recent unlocks</Text>
          {openCommands.data.map((cmd) => (
            <Card key={cmd.id}>
              <Text className="text-body text-ink">
                {cmd.gate?.name ?? "Gate"} · {cmd.status}
              </Text>
              <Text className="text-caption text-ink-muted">
                {cmd.reason} · {format(new Date(cmd.created_at), "d MMM, h:mm a")}
              </Text>
            </Card>
          ))}
        </>
      ) : null}

      <Text className="text-title text-ink">Schedule a shift</Text>
      <Field label="Find guard" value={guardSearch} onChangeText={setGuardSearch} />
      <Text className="text-caption text-ink-muted">Select guard</Text>
      <View className="flex-row flex-wrap gap-2">
        {guards.map((guard) => (
          <Button key={guard.id} title={guard.name} variant={guardId === guard.id ? "primary" : "ghost"} selected={guardId === guard.id} onPress={() => setGuardId(guard.id)} />
        ))}
      </View>
      <Text className="text-caption text-ink-muted">Select gate</Text>
      <View className="flex-row flex-wrap gap-2">
        {gates.data?.filter((gate) => gate.is_active).map((gate) => (
          <Button key={gate.id} title={gate.name} variant={gateId === gate.id ? "primary" : "ghost"} selected={gateId === gate.id} onPress={() => setGateId(gate.id)} />
        ))}
      </View>
      <DateTimeField label="Starts" value={startsAt} minimumDate={new Date()} onChange={setStartsAt} />
      <DateTimeField label="Ends" value={endsAt} minimumDate={startsAt} onChange={setEndsAt} />
      <Button
        title="Schedule shift"
        disabled={!guardId || !gateId || endsAt <= startsAt}
        loading={saveShift.isPending}
        onPress={() => saveShift.mutate({ guardId, gateId, startsAt, endsAt }, mutationFeedback("Shift scheduled"))}
      />
      {shifts.data?.map((shift) => (
        <Card key={shift.id}>
          <Text className="text-title text-ink">{shift.guard?.name ?? "Guard"} · {shift.gate?.name ?? "Unassigned"}</Text>
          <Text className="text-caption text-ink-muted">{format(new Date(shift.starts_at), "d MMM, h:mm a")}–{format(new Date(shift.ends_at), "h:mm a")}</Text>
          <Badge label={shift.status.replace("_", " ")} />
        </Card>
      ))}

      <Text className="text-title text-ink">Device sessions</Text>
      <Field label="Revocation reason" value={revokeReason} onChangeText={setRevokeReason} placeholder="Required to revoke" />
      {!sessions.data?.length ? <EmptyState title="No guard devices registered" /> : null}
      {sessions.data?.map((session) => (
        <Card key={session.id}>
          <View className="flex-row items-center justify-between">
            <Text className="text-title text-ink">{session.guard?.name ?? "Guard"}</Text>
            <Badge label={session.status} tone={session.status === "active" ? "approve" : "deny"} />
          </View>
          <Text className="text-body text-ink-soft">{session.device_name ?? session.device_id} · {session.gate?.name ?? "No gate"}</Text>
          <Text className="text-caption text-ink-muted">Last heartbeat {format(new Date(session.last_seen_at), "d MMM, h:mm a")}</Text>
          {session.status === "active" ? (
            <Button
              title="Revoke device"
              variant="deny"
              disabled={revokeReason.trim().length < 3}
              loading={revoke.isPending}
              onPress={async () => {
                const auth = await confirmSensitiveAction("Confirm device revocation");
                if (!auth.ok) {
                  Alert.alert("Revoke blocked", localAuthFailureMessage(auth));
                  return;
                }
                if (session.guard) {
                  revoke.mutate(
                    { sessionId: session.id, guardId: session.guard.id, reason: revokeReason.trim() },
                    { onSuccess: () => setRevokeReason("") },
                  );
                }
              }}
            />
          ) : null}
        </Card>
      ))}

      <DeliveryPartnerKeysCard />
    </AdminRoute>
  );
}

function DeliveryPartnerKeysCard() {
  const supabase = useSupabase();
  const profile = useSessionStore((s) => s.profile);
  const [slug, setSlug] = useState("zepto");
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!profile?.society_id || slug.trim().length < 2 || secret.trim().length < 8) {
      Alert.alert("Missing fields", "Partner slug and a secret (8+ chars) are required.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("delivery_partner_keys").upsert(
        {
          society_id: profile.society_id,
          partner_slug: slug.trim().toLowerCase(),
          hmac_secret: secret.trim(),
          label: slug.trim(),
          is_active: true,
          created_by: profile.id,
        },
        { onConflict: "society_id,partner_slug" },
      );
      if (error) throw error;
      Alert.alert(
        "Partner key saved",
        "Partners POST to /functions/v1/partner-delivery-webhook with header X-Portl-Signature = HMAC-SHA256(secret, rawBody).",
      );
      setSecret("");
    } catch (e: unknown) {
      Alert.alert("Couldn’t save", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="gap-2">
      <Text className="text-title text-ink">Delivery partner API</Text>
      <Text className="text-caption text-ink-muted">
        HMAC webhook creates a delivery pre-approval for Zepto/Blinkit-style partners.
      </Text>
      <Field label="Partner slug" value={slug} onChangeText={setSlug} placeholder="zepto" autoCapitalize="none" />
      <Field label="HMAC secret" value={secret} onChangeText={setSecret} placeholder="shared secret" autoCapitalize="none" />
      <Button title="Save partner key" loading={saving} onPress={() => void save()} />
    </Card>
  );
}
