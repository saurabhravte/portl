import { useSupabase } from "@/lib/supabase";
import { parseInput, residentVehicleSchema, uuidSchema } from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface ResidentVehicleRow {
  id: string;
  plate: string;
  label: string | null;
  auto_approve: boolean;
  created_at: string;
}

export function useMyVehicles() {
  const supabase = useSupabase();
  const flatId = useSessionStore((s) => s.profile?.flat_id);
  return useQuery({
    queryKey: ["my-vehicles", flatId],
    enabled: !!flatId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resident_vehicles")
        .select("id,plate,label,auto_approve,created_at")
        .eq("flat_id", flatId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ResidentVehicleRow[];
    },
  });
}

export function useAddVehicle() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async (input: {
      plate: string;
      label?: string;
      autoApprove?: boolean;
    }) => {
      const parsed = parseInput(residentVehicleSchema, input);
      if (!profile?.flat_id) throw new Error("A linked flat is required.");
      const { error } = await supabase.from("resident_vehicles").insert({
        society_id: profile.society_id,
        flat_id: profile.flat_id,
        created_by: profile.id,
        plate: parsed.plate,
        label: parsed.label ?? null,
        auto_approve: parsed.autoApprove,
      });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["my-vehicles"] }),
  });
}

export function useRemoveVehicle() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const vehicleId = parseInput(uuidSchema, id);
      const { error } = await supabase
        .from("resident_vehicles")
        .delete()
        .eq("id", vehicleId);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["my-vehicles"] }),
  });
}

export interface VehicleLookup {
  plate?: string;
  label?: string | null;
  auto_approve?: boolean;
  flat_number?: string;
  owner_name?: string | null;
}

/** Guard gate lookup: does this plate belong to a registered vehicle? */
export function useLookupVehicle() {
  const supabase = useSupabase();
  return useMutation({
    mutationFn: async (plate: string): Promise<VehicleLookup | null> => {
      const { data, error } = await supabase.rpc("lookup_vehicle", {
        p_plate: plate,
      });
      if (error) throw error;
      const result = (data ?? {}) as VehicleLookup;
      return result.plate ? result : null;
    },
  });
}
