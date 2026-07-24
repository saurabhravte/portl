import type { VisitorType } from "@/features/visitors/hooks";
import { useSupabase } from "@/lib/supabase";
import { parseInput, recurringPassSchema, uuidSchema } from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface RecurringPassRow {
  id: string;
  name: string;
  type: VisitorType;
  days_of_week: number[];
  start_minute: number;
  end_minute: number;
  active: boolean;
  created_at: string;
}

export function useRecurringPasses() {
  const supabase = useSupabase();
  const flatId = useSessionStore((s) => s.profile?.flat_id);
  return useQuery({
    queryKey: ["recurring-passes", flatId],
    enabled: !!flatId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_passes")
        .select("id,name,type,days_of_week,start_minute,end_minute,active,created_at")
        .eq("flat_id", flatId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as RecurringPassRow[];
    },
  });
}

export function useAddRecurringPass() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async (input: {
      name: string;
      type: VisitorType;
      daysOfWeek: number[];
      startMinute: number;
      endMinute: number;
      active?: boolean;
    }) => {
      const parsed = parseInput(recurringPassSchema, input);
      if (!profile?.flat_id) throw new Error("A linked flat is required.");
      const { error } = await supabase.from("recurring_passes").insert({
        society_id: profile.society_id,
        flat_id: profile.flat_id,
        created_by: profile.id,
        name: parsed.name,
        type: parsed.type,
        days_of_week: parsed.daysOfWeek,
        start_minute: parsed.startMinute,
        end_minute: parsed.endMinute,
        active: parsed.active,
      });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["recurring-passes"] }),
  });
}

export function useRemoveRecurringPass() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const passId = parseInput(uuidSchema, id);
      const { error } = await supabase
        .from("recurring_passes")
        .delete()
        .eq("id", passId);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["recurring-passes"] }),
  });
}

/** Guard: does a named visitor match an active recurring window for a flat? */
export function useRecurringMatch() {
  const supabase = useSupabase();
  return useMutation({
    mutationFn: async ({ flatId, name }: { flatId: string; name: string }) => {
      const { data, error } = await supabase.rpc("recurring_pass_matches", {
        p_flat_id: flatId,
        p_name: name,
      });
      if (error) throw error;
      return Boolean(data);
    },
  });
}
