import { useSupabase } from "@/lib/supabase";
import {
  idSchema,
  parseInput,
  staffCheckInSchema,
} from "@/lib/validation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type StaffOnDutyRow = {
  attendance_id: string;
  staff_id: string;
  staff_name: string;
  category: string;
  checked_in_at: string;
  method: string;
};

export function useStaffOnDuty() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["staff-on-duty"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("society_staff_on_duty");
      if (error) throw error;
      return (data as unknown as StaffOnDutyRow[]) ?? [];
    },
  });
}

export function useStaffAttendanceMutations() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["staff-on-duty"] });
    qc.invalidateQueries({ queryKey: ["admin-dataset", "staff"] });
  };

  const checkIn = useMutation({
    mutationFn: async (input: {
      code?: string;
      staffId?: string;
      method?: "manual" | "qr" | "code";
    }) => {
      const parsed = parseInput(staffCheckInSchema, input);
      const { data, error } = await supabase.rpc("check_in_staff", {
        p_code: parsed.code,
        p_staff_id: parsed.staffId,
        p_method: parsed.method,
      });
      if (error) throw error;
      return data as unknown as {
        ok: boolean;
        alreadyIn: boolean;
        attendanceId: string;
        staffName: string;
        category: string;
      };
    },
    onSettled: invalidate,
  });

  const checkOut = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      ({ id } = parseInput(idSchema, { id }));
      const { error } = await supabase.rpc("check_out_staff", {
        p_attendance_id: id,
      });
      if (error) throw error;
    },
    onSettled: invalidate,
  });

  return { checkIn, checkOut };
}
