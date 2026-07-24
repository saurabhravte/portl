import { useSupabase } from "@/lib/supabase";
import { parseInput, userIdSchema, uuidSchema } from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface FlatMember {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  isSelf: boolean;
  createdAt: string;
}

export function useFlatMembers() {
  const supabase = useSupabase();
  const flatId = useSessionStore((s) => s.profile?.flat_id);
  return useQuery({
    queryKey: ["flat-members", flatId],
    enabled: !!flatId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_flat_members");
      if (error) throw error;
      return (data ?? []) as unknown as FlatMember[];
    },
  });
}

export function useRemoveFlatMember() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (profileId: string) => {
      const id = parseInput(userIdSchema, profileId);
      const { error } = await supabase.rpc("remove_flat_member", {
        p_profile_id: id,
      });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["flat-members"] }),
  });
}

export function useCancelHouseholdInvite() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const id = parseInput(uuidSchema, inviteId);
      const { error } = await supabase.rpc("cancel_household_invite", {
        p_invite_id: id,
      });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["household-invites"] }),
  });
}
