import { useSupabase } from "@/lib/supabase";
import {
  gateSchema,
  guardDeviceSchema,
  guardShiftSchema,
  guardShiftStatusSchema,
  parseInput,
  revokeGuardSessionSchema,
} from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface GateRow {
  id: string;
  name: string;
  is_active: boolean;
}

export interface GuardShiftRow {
  id: string;
  starts_at: string;
  ends_at: string;
  status: "scheduled" | "checked_in" | "completed" | "missed" | "cancelled";
  checked_in_at: string | null;
  checked_out_at: string | null;
  guard: { id: string; name: string } | null;
  gate: GateRow | null;
}

const SHIFT_STATUSES: readonly GuardShiftRow["status"][] = [
  "scheduled",
  "checked_in",
  "completed",
  "missed",
  "cancelled",
];

function toShiftStatus(value: string): GuardShiftRow["status"] {
  if (SHIFT_STATUSES.includes(value as GuardShiftRow["status"])) {
    return value as GuardShiftRow["status"];
  }
  throw new Error(`Unknown guard shift status: ${value}`);
}

export function useGates() {
  const supabase = useSupabase();
  const societyId = useSessionStore((state) => state.profile?.society_id);
  const role = useSessionStore((state) => state.profile?.role);
  return useQuery({
    queryKey: ["gates", societyId],
    enabled: !!societyId,
    queryFn: async () => {
      let query = supabase
        .from("gates")
        .select("id,name,is_active")
        .order("name");
      if (role !== "admin") query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export interface GuardDeviceSessionRow {
  id: string;
  device_id: string;
  device_name: string | null;
  status: string;
  last_seen_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
  guard: { id: string; name: string } | null;
  gate: { id: string; name: string } | null;
}

export function useGuardDeviceSessions() {
  const supabase = useSupabase();
  const societyId = useSessionStore((state) => state.profile?.society_id);
  return useQuery({
    queryKey: ["guard-device-sessions", societyId],
    enabled: !!societyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guard_device_sessions")
        .select("id,device_id,device_name,status,last_seen_at,revoked_at,revoke_reason,guard:profiles(id,name),gate:gates(id,name)")
        .order("last_seen_at", { ascending: false });
      if (error) throw error;
      return data as unknown as GuardDeviceSessionRow[];
    },
  });
}

export function useRevokeGuardDevice() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sessionId,
      guardId,
      reason,
    }: {
      sessionId: string;
      guardId: string;
      reason: string;
    }) => {
      ({ sessionId, guardId, reason } = parseInput(revokeGuardSessionSchema, {
        sessionId,
        guardId,
        reason,
      }));
      const { error } = await supabase.functions.invoke("revoke-guard-session", {
        body: { guardId, deviceSessionId: sessionId, reason },
      });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["guard-device-sessions"] }),
  });
}

export interface GuardOnDutyRow {
  shift_id: string;
  guard_name: string;
  gate_id: string | null;
  gate_name: string | null;
  starts_at: string;
  ends_at: string;
  status: GuardShiftRow["status"];
  checked_in_at: string | null;
  checked_out_at: string | null;
  handover_note?: string | null;
  handover_at?: string | null;
  is_on_duty: boolean;
}

/**
 * Live "who is on duty" board. Visible to every authenticated member of the
 * society (residents, guards, admins) via the society_guards_on_duty()
 * SECURITY DEFINER function — the base guard_shifts table stays locked down.
 */
export function useGuardsOnDuty() {
  const supabase = useSupabase();
  const societyId = useSessionStore((state) => state.profile?.society_id);
  return useQuery({
    queryKey: ["guards-on-duty", societyId],
    enabled: !!societyId,
    // Fresh-ish so residents see check-ins land without a manual refresh.
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("society_guards_on_duty");
      if (error) throw error;
      return (data ?? []) as unknown as GuardOnDutyRow[];
    },
  });
}

export interface GuardAttendanceSummary {
  scheduled: number;
  checked_in: number;
  completed: number;
  missed: number;
  cancelled: number;
  on_duty_now: number;
  from: string;
  to: string;
}

/** Admin-only attendance roll-up over a time window. */
export function useGuardAttendanceSummary() {
  const supabase = useSupabase();
  const role = useSessionStore((state) => state.profile?.role);
  const societyId = useSessionStore((state) => state.profile?.society_id);
  return useQuery({
    queryKey: ["guard-attendance-summary", societyId],
    enabled: !!societyId && role === "admin",
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "society_guard_attendance_summary",
        {},
      );
      if (error) throw error;
      return (data ?? {}) as unknown as GuardAttendanceSummary;
    },
  });
}

export function useGuardShifts() {
  const supabase = useSupabase();
  const profile = useSessionStore((state) => state.profile);
  return useQuery({
    queryKey: ["guard-shifts", profile?.id, profile?.role],
    enabled: !!profile && ["guard", "admin"].includes(profile.role),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guard_shifts")
        .select(
          "id,starts_at,ends_at,status,checked_in_at,checked_out_at,guard:profiles(id,name),gate:gates(id,name,is_active)",
        )
        .gte("ends_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString())
        .order("starts_at")
        .limit(100);
      if (error) throw error;
      return data.map((shift) => ({
        ...shift,
        status: toShiftStatus(shift.status),
      }));
    },
  });
}

export function useUpsertGuardDeviceSession() {
  const supabase = useSupabase();
  const profile = useSessionStore((state) => state.profile);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      deviceId,
      deviceName,
      gateId,
      pushToken,
    }: {
      deviceId: string;
      deviceName?: string;
      gateId?: string | null;
      pushToken?: string | null;
    }) => {
      ({ deviceId, deviceName, gateId, pushToken } = parseInput(guardDeviceSchema, {
        deviceId,
        deviceName,
        gateId,
        pushToken,
      }));
      const { error } = await supabase.from("guard_device_sessions").upsert(
        {
          society_id: profile!.society_id,
          guard_id: profile!.id,
          device_id: deviceId,
          device_name: deviceName ?? null,
          gate_id: gateId ?? null,
          push_token: pushToken ?? null,
          status: "active",
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "guard_id,device_id" },
      );
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["guard-device-sessions"] }),
  });
}

export function useUpdateMyGuardShift() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      shiftId,
      status,
      handoverNote,
    }: {
      shiftId: string;
      status: "checked_in" | "completed";
      handoverNote?: string;
    }) => {
      ({ shiftId, status } = parseInput(guardShiftStatusSchema, { shiftId, status }));
      if (status === "completed" && handoverNote?.trim()) {
        const { error: noteError } = await supabase.rpc("set_guard_shift_handover", {
          p_shift_id: shiftId,
          p_note: handoverNote.trim(),
        });
        if (noteError) throw noteError;
      }
      const { error } = await supabase.rpc("update_my_guard_shift_status", {
        p_shift_id: shiftId,
        p_status: status,
      });
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["guard-shifts"] });
      qc.invalidateQueries({ queryKey: ["guards-on-duty"] });
    },
  });
}

export function useSaveGate() {
  const supabase = useSupabase();
  const societyId = useSessionStore((state) => state.profile?.society_id);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      name,
      isActive = true,
    }: {
      id?: string;
      name: string;
      isActive?: boolean;
    }) => {
      ({ id, name, isActive } = parseInput(gateSchema, { id, name, isActive }));
      const changes = { name, is_active: isActive };
      if (!id && !societyId) throw new Error("A society is required to create a gate.");
      const { error } = id
        ? await supabase.from("gates").update(changes).eq("id", id)
        : await supabase.from("gates").insert({ ...changes, society_id: societyId! });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["gates"] }),
  });
}

export function useSaveGuardShift() {
  const supabase = useSupabase();
  const societyId = useSessionStore((state) => state.profile?.society_id);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      guardId,
      gateId,
      startsAt,
      endsAt,
      status = "scheduled",
    }: {
      id?: string;
      guardId: string;
      gateId?: string | null;
      startsAt: Date;
      endsAt: Date;
      status?: GuardShiftRow["status"];
    }) => {
      ({ id, guardId, gateId, startsAt, endsAt, status } = parseInput(
        guardShiftSchema,
        { id, guardId, gateId, startsAt, endsAt, status },
      ));
      const changes = {
        guard_id: guardId,
        gate_id: gateId ?? null,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status,
      };
      if (!id && !societyId) {
        throw new Error("A society is required to create a guard shift.");
      }
      const { error } = id
        ? await supabase.from("guard_shifts").update(changes).eq("id", id)
        : await supabase.from("guard_shifts").insert({
            ...changes,
            society_id: societyId!,
          });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["guard-shifts"] }),
  });
}
