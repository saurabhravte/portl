import { useSupabase } from "@/lib/supabase";
import { parcelSchema, parseInput, uuidSchema } from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface ParcelRow {
  id: string;
  description: string;
  shelf_label: string | null;
  photo_ref: string | null;
  status: "pending" | "collected";
  created_at: string;
  collected_at: string | null;
  flat_id: string;
  flat: { id: string; number: string | null } | null;
}

const PARCEL_SELECT =
  "id,description,shelf_label,photo_ref,status,created_at,collected_at,flat_id,flat:flats(id,number)";

/** Resident: my flat's parcels. Guards/admins: all pending in the society. */
export function useParcels(scope: "mine" | "pending" = "mine") {
  const supabase = useSupabase();
  const profile = useSessionStore((s) => s.profile);
  const flatId = profile?.flat_id;
  return useQuery({
    queryKey: ["parcels", scope, profile?.society_id, flatId],
    enabled: !!profile,
    queryFn: async () => {
      let query = supabase
        .from("parcels")
        .select(PARCEL_SELECT)
        .order("created_at", { ascending: false })
        .limit(50);
      if (scope === "mine" && flatId) query = query.eq("flat_id", flatId);
      if (scope === "pending") query = query.eq("status", "pending");
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as ParcelRow[];
    },
  });
}

export function useLogParcel() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async (input: {
      flatId: string;
      description: string;
      shelfLabel?: string;
      photoRef?: string;
    }) => {
      const parsed = parseInput(parcelSchema, input);
      if (!profile) throw new Error("Sign in required.");
      const { error } = await supabase.from("parcels").insert({
        society_id: profile.society_id,
        flat_id: parsed.flatId,
        logged_by: profile.id,
        description: parsed.description,
        shelf_label: parsed.shelfLabel ?? null,
        photo_ref: parsed.photoRef ?? null,
      });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["parcels"] }),
  });
}

export function useMarkParcelCollected() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async (id: string) => {
      const parcelId = parseInput(uuidSchema, id);
      const { error } = await supabase
        .from("parcels")
        .update({
          status: "collected",
          collected_at: new Date().toISOString(),
          collected_by: profile?.id ?? null,
        })
        .eq("id", parcelId);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["parcels"] }),
  });
}
