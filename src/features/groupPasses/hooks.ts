import type { VisitorType } from "@/features/visitors/hooks";
import { useSupabase } from "@/lib/supabase";
import { groupCodeSchema, groupPassSchema, parseInput } from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

function groupCode() {
  // 8-char uppercase alphanumeric; unique constraint guards collisions.
  return Array.from({ length: 8 }, () =>
    "ABCDEFGHJKMNPQRSTUVWXYZ23456789".charAt(Math.floor(Math.random() * 30)),
  ).join("");
}

export interface GroupPassRow {
  id: string;
  label: string;
  type: VisitorType;
  code: string;
  max_uses: number;
  uses: number;
  valid_from: string;
  valid_to: string;
  created_at: string;
}

export function useGroupPasses() {
  const supabase = useSupabase();
  const flatId = useSessionStore((s) => s.profile?.flat_id);
  return useQuery({
    queryKey: ["group-passes", flatId],
    enabled: !!flatId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_passes")
        .select("id,label,type,code,max_uses,uses,valid_from,valid_to,created_at")
        .eq("flat_id", flatId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as unknown as GroupPassRow[];
    },
  });
}

export function useCreateGroupPass() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async (input: {
      label: string;
      type?: VisitorType;
      maxUses: number;
      validFrom: Date;
      validTo: Date;
    }) => {
      const parsed = parseInput(groupPassSchema, input);
      if (!profile?.flat_id) throw new Error("A linked flat is required.");
      const { data, error } = await supabase
        .from("group_passes")
        .insert({
          society_id: profile.society_id,
          flat_id: profile.flat_id,
          created_by: profile.id,
          label: parsed.label,
          type: parsed.type,
          code: groupCode(),
          max_uses: parsed.maxUses,
          valid_from: parsed.validFrom.toISOString(),
          valid_to: parsed.validTo.toISOString(),
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as GroupPassRow;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["group-passes"] }),
  });
}

export interface GroupRedeemResult {
  ok: boolean;
  message?: string;
  visitor_name?: string;
  type?: VisitorType;
  flat_number?: string;
  remaining?: number;
}

/** Guard: admit one guest against a group/event code. */
export function useRedeemGroupCode() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      code,
      guestName,
    }: {
      code: string;
      guestName?: string;
    }): Promise<GroupRedeemResult> => {
      code = parseInput(groupCodeSchema, code);
      const { data, error } = await supabase.rpc("redeem_group_code", {
        p_code: code,
        p_guest_name: guestName,
      });
      if (error) throw error;
      const result = (data ?? { ok: false }) as unknown as GroupRedeemResult;
      if (!result.ok) {
        throw new Error(result.message ?? "Group code could not be verified.");
      }
      return result;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gate"] }),
  });
}
