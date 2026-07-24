import type { VisitorType } from "@/features/visitors/hooks";
import { usePrefs } from "@/lib/i18n";
import { gateBreadcrumb } from "@/lib/sentry";
import { useSupabase } from "@/lib/supabase";
import {
  gateCodeSchema,
  parseInput,
  preApprovalSchema,
  redeemGateCodeResultSchema,
  revokePreApprovalSchema,
} from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

function sixDigitCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export interface PreApprovalRow {
  id: string;
  visitor_name: string;
  type: VisitorType;
  code: string;
  valid_from: string;
  valid_to: string;
  used_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  created_at: string;
}

export function useMyPreApprovals() {
  const supabase = useSupabase();
  const flatId = useSessionStore((s) => s.profile?.flat_id);
  return useQuery({
    queryKey: ["pre-approvals", flatId],
    enabled: !!flatId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pre_approvals")
        .select("*")
        .eq("flat_id", flatId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as PreApprovalRow[];
    },
  });
}

export function useCreatePreApproval() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async (input: {
      visitorName: string;
      type: VisitorType;
      validFrom: Date;
      validTo: Date;
    }) => {
      const parsed = parseInput(preApprovalSchema, input);
      if (!profile?.flat_id) {
        throw new Error("A linked flat is required to create a gate pass.");
      }
      const { data, error } = await supabase
        .from("pre_approvals")
        .insert({
          flat_id: profile.flat_id,
          created_by: profile.id,
          visitor_name: parsed.visitorName,
          type: parsed.type,
          code: sixDigitCode(),
          valid_from: parsed.validFrom.toISOString(),
          valid_to: parsed.validTo.toISOString(),
        })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pre-approvals"] }),
  });
}

export function usePreApprovalEvents(preApprovalId: string | null) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["pre-approval-events", preApprovalId],
    enabled: !!preApprovalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pre_approval_events")
        .select("id,event,detail,created_at")
        .eq("pre_approval_id", preApprovalId!)
        .order("created_at");
      if (error) throw error;
      return data as {
        id: string;
        event: "created" | "used" | "revoked";
        detail: string | null;
        created_at: string;
      }[];
    },
  });
}

export function useRevokePreApproval() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      ({ id, reason } = parseInput(revokePreApprovalSchema, { id, reason }));
      const { error } = await supabase.rpc("revoke_pre_approval", {
        p_id: id,
        p_reason: reason?.trim() || undefined,
      });
      if (error) throw error;
    },
    onSettled: (_data, _error, variables) => {
      qc.invalidateQueries({ queryKey: ["pre-approvals"] });
      qc.invalidateQueries({ queryKey: ["pre-approval-events", variables.id] });
    },
  });
}

export interface RedeemResult {
  visitor_name: string;
  type: VisitorType;
  flat_number: string;
  gate_log_id: string;
  training?: boolean;
}

/** Guard: verify a code. All server-side now — a single transactional RPC
 *  (select → visitor → gate log → burn code) with per-guard rate limiting
 *  (sprint ticket #13). */
export function useVerifyCode() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string): Promise<RedeemResult> => {
      code = parseInput(gateCodeSchema, code);
      if (usePrefs.getState().trainingMode) {
        return {
          visitor_name: "Practice Visitor",
          type: "guest",
          flat_number: "000",
          gate_log_id: "training",
          training: true,
        };
      }
      gateBreadcrumb("redeem gate code");
      const { data, error } = await supabase.rpc("redeem_gate_code", {
        p_code: code,
      });
      if (error) throw error;
      if (!data || typeof data !== "object" || Array.isArray(data) || data.ok === false) {
        const message =
          data && typeof data === "object" && !Array.isArray(data) &&
          typeof data.message === "string"
            ? data.message
            : "Gate code could not be verified.";
        throw new Error(message);
      }
      return parseInput(redeemGateCodeResultSchema, data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gate"] }),
  });
}
