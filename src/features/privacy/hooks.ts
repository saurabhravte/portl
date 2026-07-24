import { useSupabase } from "@/lib/supabase";
import { parseInput, privacyActionSchema } from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

const artifactUrlResultSchema = z.strictObject({ url: z.url() });
const requestResultSchema = z.strictObject({ requestId: z.uuid() });
const deletionResultSchema = z.strictObject({
  requestId: z.uuid(),
  sessionsRevoked: z.literal(true),
});
const cancellationResultSchema = z.strictObject({ cancelled: z.boolean() });

export function usePrivacyStatus() {
  const supabase = useSupabase();
  const profileId = useSessionStore((state) => state.profile?.id);
  return useQuery({
    queryKey: ["privacy-status", profileId],
    enabled: !!profileId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const [exports, deletion] = await Promise.all([
        supabase
          .from("personal_data_export_requests")
          .select("id,status,requested_at,completed_at,error_code,artifact:export_artifacts(id,status,expires_at)")
          .order("requested_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("account_deletion_requests")
          .select("id,status,requested_at,execute_after,cancelled_at,completed_at,error_code")
          .order("requested_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (exports.error) throw exports.error;
      if (deletion.error) throw deletion.error;
      return { exportRequest: exports.data, deletionRequest: deletion.data };
    },
  });
}

function usePrivacyAction(action: string) {
  const supabase = useSupabase();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (extra: Record<string, unknown> = {}) => {
      const body = parseInput(privacyActionSchema, { action, ...extra });
      const { data, error } = await supabase.functions.invoke("privacy-request", {
        body,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const parsed =
        action === "artifact_url"
          ? parseInput(artifactUrlResultSchema, data)
          : action === "cancel_deletion"
            ? parseInput(cancellationResultSchema, data)
            : action === "request_deletion"
              ? parseInput(deletionResultSchema, data)
              : parseInput(requestResultSchema, data);
      return parsed as {
        url: string;
        ok?: boolean;
      };
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["privacy-status"] }),
  });
}

export const useRequestPersonalExport = () => usePrivacyAction("request_export");
export const useRequestAccountDeletion = () => usePrivacyAction("request_deletion");
export const useCancelAccountDeletion = () => usePrivacyAction("cancel_deletion");
export const useArtifactUrl = () => usePrivacyAction("artifact_url");
