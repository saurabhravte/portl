import { useSupabase } from "@/lib/supabase";
import { parseInput, residentIdVerifySchema } from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useMyResidentId() {
  const supabase = useSupabase();
  const profileId = useSessionStore((s) => s.profile?.id);
  const role = useSessionStore((s) => s.profile?.role);
  return useQuery({
    queryKey: ["resident-id", profileId],
    enabled: !!profileId && role === "resident",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ensure_my_resident_id");
      if (error) throw error;
      return String(data);
    },
  });
}

export interface ResidentIdVerifyResult {
  ok: boolean;
  code?: string;
  message?: string;
  name?: string;
  flatNumber?: string;
  phone?: string | null;
}

export function useVerifyResidentId() {
  const supabase = useSupabase();
  return useMutation({
    mutationFn: async (code: string): Promise<ResidentIdVerifyResult> => {
      const parsed = parseInput(residentIdVerifySchema, { code });
      const { data, error } = await supabase.rpc("verify_resident_id", {
        p_code: parsed.code,
      });
      if (error) throw error;
      return (data ?? { ok: false }) as unknown as ResidentIdVerifyResult;
    },
  });
}

export function residentIdQrValue(code: string) {
  return `portl://resident-id?code=${encodeURIComponent(code)}`;
}
