import { useSupabase } from "@/lib/supabase";
import {
  gateIotDeviceSchema,
  gateOpenRequestSchema,
  parseInput,
  uuidSchema,
} from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface GateIotDeviceRow {
  id: string;
  gate_id: string;
  provider: "mock" | "webhook";
  label: string;
  external_id: string | null;
  webhook_url: string | null;
  is_active: boolean;
  last_status: "unknown" | "locked" | "unlocked" | "error";
  last_status_at: string | null;
  gate: { id: string; name: string } | null;
}

export interface GateOpenCommandRow {
  id: string;
  gate_id: string;
  device_id: string;
  reason: string;
  status: "pending" | "sent" | "opened" | "failed" | "cancelled";
  created_at: string;
  completed_at: string | null;
  gate: { id: string; name: string } | null;
}

export function useGateIotDevices() {
  const supabase = useSupabase();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  return useQuery({
    queryKey: ["gate-iot-devices", societyId],
    enabled: !!societyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gate_iot_devices")
        .select(
          "id,gate_id,provider,label,external_id,webhook_url,is_active,last_status,last_status_at,gate:gates(id,name)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as GateIotDeviceRow[];
    },
  });
}

export function useSaveGateIotDevice() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      gateId: string;
      provider: "mock" | "webhook";
      label: string;
      externalId?: string;
      webhookUrl?: string;
      isActive?: boolean;
    }) => {
      const parsed = parseInput(gateIotDeviceSchema, input);
      if (!profile?.society_id) throw new Error("A society is required.");
      const row = {
        gate_id: parsed.gateId,
        provider: parsed.provider,
        label: parsed.label,
        external_id: parsed.externalId ?? null,
        webhook_url: parsed.provider === "webhook" ? (parsed.webhookUrl ?? null) : null,
        is_active: parsed.isActive,
      };
      if (parsed.id) {
        const { error } = await supabase
          .from("gate_iot_devices")
          .update(row)
          .eq("id", parsed.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("gate_iot_devices").insert({
        ...row,
        society_id: profile.society_id,
        created_by: profile.id,
      });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["gate-iot-devices"] }),
  });
}

export function useRemoveGateIotDevice() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const deviceId = parseInput(uuidSchema, id);
      const { error } = await supabase.from("gate_iot_devices").delete().eq("id", deviceId);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["gate-iot-devices"] }),
  });
}

export function useRecentGateOpenCommands() {
  const supabase = useSupabase();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  return useQuery({
    queryKey: ["gate-open-commands", societyId],
    enabled: !!societyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gate_open_commands")
        .select("id,gate_id,device_id,reason,status,created_at,completed_at,gate:gates(id,name)")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as unknown as GateOpenCommandRow[];
    },
  });
}

/**
 * Request an unlock: creates an audited command, then asks the edge worker
 * to talk to the mock / webhook provider.
 */
export function useRequestGateOpen() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { gateId: string; reason: string }) => {
      const parsed = parseInput(gateOpenRequestSchema, input);
      const { data, error } = await supabase.rpc("request_gate_open", {
        p_gate_id: parsed.gateId,
        p_reason: parsed.reason,
      });
      if (error) throw error;
      const command = data as unknown as {
        commandId: string
        provider: string
        status: string
      };
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke(
        "iot-gate-command",
        { body: { commandId: command.commandId } },
      );
      if (edgeError) throw edgeError;
      return { ...command, edge: edgeData };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["gate-open-commands"] });
      qc.invalidateQueries({ queryKey: ["gate-iot-devices"] });
    },
  });
}
