import { useSupabase } from "@/lib/supabase";
import { parseInput, sosAlertSchema, uuidSchema } from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface SosAlertRow {
  id: string;
  kind: "sos" | "panic";
  note: string | null;
  status: "active" | "resolved";
  created_at: string;
  raised_by: string;
  flat_id: string | null;
  raiser: { id: string; name: string | null } | null;
  flat: { id: string; number: string | null } | null;
}

/** Resident SOS / guard panic. Fans out to guards + admins + family. */
export function useRaiseSos() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { kind: "sos" | "panic"; note?: string }) => {
      const { kind, note } = parseInput(sosAlertSchema, input);
      const { data, error } = await supabase.rpc("raise_sos_alert", {
        p_kind: kind,
        p_note: note,
      });
      if (error) throw error;
      return data as unknown as string;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["sos-alerts"] }),
  });
}

/** Active alerts for the society — guards/admins see all, residents their own. */
export function useActiveSosAlerts() {
  const supabase = useSupabase();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  return useQuery({
    queryKey: ["sos-alerts", societyId],
    enabled: !!societyId,
    // Emergencies: keep this fresh even between push deliveries.
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sos_alerts")
        .select(
          "id,kind,note,status,created_at,raised_by,flat_id,raiser:profiles!sos_alerts_raised_by_fkey(id,name),flat:flats(id,number)",
        )
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as SosAlertRow[];
    },
  });
}

export function useResolveSos() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const alertId = parseInput(uuidSchema, id);
      const { error } = await supabase.rpc("resolve_sos_alert", {
        p_id: alertId,
      });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["sos-alerts"] }),
  });
}
