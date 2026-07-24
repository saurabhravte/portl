import { useSupabase } from "@/lib/supabase";
import {
  domesticCheckInSchema,
  domesticHelperSchema,
  parseInput,
  uuidSchema,
} from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface DomesticHelperRow {
  id: string;
  name: string;
  role: "maid" | "cook" | "driver" | "other";
  phone: string | null;
  checkin_code: string;
  is_active: boolean;
  created_at: string;
}

export interface DomesticOnDutyRow {
  attendanceId: string;
  helperId: string;
  helperName: string;
  role: string;
  flatNumber: string;
  checkedInAt: string;
  method: string;
}

function randomHelperCode() {
  return `H${String(Math.floor(100000 + Math.random() * 900000))}`;
}

export function useDomesticHelpers() {
  const supabase = useSupabase();
  const flatId = useSessionStore((s) => s.profile?.flat_id);
  return useQuery({
    queryKey: ["domestic-helpers", flatId],
    enabled: !!flatId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("domestic_helpers")
        .select("id,name,role,phone,checkin_code,is_active,created_at")
        .eq("flat_id", flatId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as DomesticHelperRow[];
    },
  });
}

export function useAddDomesticHelper() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async (input: {
      name: string;
      role?: "maid" | "cook" | "driver" | "other";
      phone?: string;
    }) => {
      const parsed = parseInput(domesticHelperSchema, input);
      if (!profile?.flat_id) throw new Error("A linked flat is required.");
      const { error } = await supabase.from("domestic_helpers").insert({
        society_id: profile.society_id,
        flat_id: profile.flat_id,
        created_by: profile.id,
        name: parsed.name,
        role: parsed.role,
        phone: parsed.phone ?? null,
        checkin_code: randomHelperCode(),
      });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["domestic-helpers"] }),
  });
}

export function useSetDomesticHelperActive() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const helperId = parseInput(uuidSchema, id);
      const { error } = await supabase
        .from("domestic_helpers")
        .update({ is_active: isActive })
        .eq("id", helperId);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["domestic-helpers"] }),
  });
}

export function useDomesticOnDuty() {
  const supabase = useSupabase();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  return useQuery({
    queryKey: ["domestic-on-duty", societyId],
    enabled: !!societyId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("domestic_on_duty");
      if (error) throw error;
      return (data ?? []) as unknown as DomesticOnDutyRow[];
    },
  });
}

export function useCheckInDomesticHelper() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      code?: string;
      helperId?: string;
      method?: "manual" | "qr" | "code";
    }) => {
      const parsed = parseInput(domesticCheckInSchema, input);
      const { data, error } = await supabase.rpc("check_in_domestic_helper", {
        p_code: parsed.code ?? undefined,
        p_helper_id: parsed.helperId ?? undefined,
        p_method: parsed.method,
      });
      if (error) throw error;
      return data as unknown as {
        ok: boolean;
        alreadyIn?: boolean;
        attendanceId: string;
        helperName: string;
        role: string;
        flatNumber?: string;
      };
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["domestic-on-duty"] }),
  });
}

export function useCheckOutDomesticHelper() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (attendanceId: string) => {
      const id = parseInput(uuidSchema, attendanceId);
      const { error } = await supabase.rpc("check_out_domestic_helper", {
        p_attendance_id: id,
      });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["domestic-on-duty"] }),
  });
}

export function helperCheckinQrValue(code: string) {
  return `portl://helper-checkin?code=${encodeURIComponent(code)}`;
}
