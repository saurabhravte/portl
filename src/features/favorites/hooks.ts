import type { VisitorType } from "@/features/visitors/hooks";
import { useSupabase } from "@/lib/supabase";
import { favoriteVisitorSchema, parseInput, uuidSchema } from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface FavoriteVisitorRow {
  id: string;
  name: string;
  type: VisitorType;
  phone: string | null;
  vehicle_no: string | null;
  created_at: string;
}

export function useFavoriteVisitors() {
  const supabase = useSupabase();
  const flatId = useSessionStore((s) => s.profile?.flat_id);
  return useQuery({
    queryKey: ["favorite-visitors", flatId],
    enabled: !!flatId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("favorite_visitors")
        .select("id,name,type,phone,vehicle_no,created_at")
        .eq("flat_id", flatId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as FavoriteVisitorRow[];
    },
  });
}

export function useAddFavoriteVisitor() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async (input: {
      name: string;
      type: VisitorType;
      phone?: string;
      vehicleNo?: string;
    }) => {
      const parsed = parseInput(favoriteVisitorSchema, input);
      if (!profile?.flat_id) throw new Error("A linked flat is required.");
      const { error } = await supabase.from("favorite_visitors").insert({
        society_id: profile.society_id,
        flat_id: profile.flat_id,
        created_by: profile.id,
        name: parsed.name,
        type: parsed.type,
        phone: parsed.phone ?? null,
        vehicle_no: parsed.vehicleNo ?? null,
      });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["favorite-visitors"] }),
  });
}

export function useRemoveFavoriteVisitor() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const favoriteId = parseInput(uuidSchema, id);
      const { error } = await supabase
        .from("favorite_visitors")
        .delete()
        .eq("id", favoriteId);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["favorite-visitors"] }),
  });
}
