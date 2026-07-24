import { usePrefs } from "@/lib/i18n";
import {
  isOnlineNow,
  newQueueId,
  useOfflineQueue,
} from "@/lib/offline";
import {
  makeAmbiguousFailureReplay,
  makeQueuedAction,
  type NewQueuedGateAction,
} from "@/lib/offlineQueue";
import { queryKeys } from "@/lib/queryState";
import { useRealtimeRefreshPolicy } from "@/lib/realtimeHealth";
import { gateBreadcrumb } from "@/lib/sentry";
import { useSupabase } from "@/lib/supabase";
import {
  adminOverrideResultSchema,
  adminOverrideSchema,
  logIdSchema,
  markEntryResultSchema,
  markExitResultSchema,
  newVisitorSchema,
  parseInput,
  privilegedRpcResultSchema,
  raiseVisitorResultSchema,
  requestIdSchema,
  retryVisitorResultSchema,
  visitorDecisionSchema,
  visitorIdSchema,
} from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useState } from "react";

export type VisitorType = "guest" | "delivery" | "cab" | "service";
export type RequestStatus = "pending" | "approved" | "denied" | "expired";

const VISITOR_TYPES: readonly VisitorType[] = ["guest", "delivery", "cab", "service"];
const REQUEST_STATUSES: readonly RequestStatus[] = [
  "pending",
  "approved",
  "denied",
  "expired",
];

function toVisitorType(value: string): VisitorType {
  if (VISITOR_TYPES.includes(value as VisitorType)) return value as VisitorType;
  throw new Error(`Unknown visitor type: ${value}`);
}

function toRequestStatus(value: string): RequestStatus {
  if (REQUEST_STATUSES.includes(value as RequestStatus)) return value as RequestStatus;
  throw new Error(`Unknown visitor request status: ${value}`);
}

export interface VisitorRequestRow {
  id: string;
  status: RequestStatus;
  created_at: string;
  visitor: {
    id: string;
    name: string;
    phone: string | null;
    type: VisitorType;
    flat_id: string;
    photo_url?: string | null;
    vehicle_no?: string | null;
  };
  flat?: { number: string; tower?: { name: string } };
}

function enqueueGateAction(
  action: NewQueuedGateAction,
  idempotencyKey: string,
) {
  useOfflineQueue
    .getState()
    .enqueue(makeQueuedAction(action, idempotencyKey));
}

function enqueueAmbiguousFailure(
  action: NewQueuedGateAction,
  idempotencyKey: string,
  error: unknown,
) {
  const replay = makeAmbiguousFailureReplay(action, idempotencyKey, error);
  if (!replay) return false;
  useOfflineQueue.getState().enqueue(replay);
  return true;
}

/** Live pending requests for the signed-in resident's flat. */
export function useFlatApprovals() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const flatId = useSessionStore((s) => s.profile?.flat_id);
  const [realtimeHealthy, setRealtimeHealthy] = useState(false);
  const refresh = useCallback(
    () => void qc.invalidateQueries({ queryKey: queryKeys.approvals(flatId) }),
    [flatId, qc],
  );
  useRealtimeRefreshPolicy({ healthy: realtimeHealthy, refresh });

  const query = useQuery({
    queryKey: queryKeys.approvals(flatId),
    enabled: !!flatId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visitor_requests")
        .select(
          "id,status,created_at,visitor:visitors!inner(id,name,phone,type,flat_id,photo_url,vehicle_no)",
        )
        .eq("visitor.flat_id", flatId!)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map((row) => ({
        ...row,
        status: toRequestStatus(row.status),
        visitor: { ...row.visitor, type: toVisitorType(row.visitor.type) },
      }));
    },
  });

  // Realtime: any change to visitor_requests refreshes the card list.
  useEffect(() => {
    if (!flatId) return;
    const channel = supabase
      .channel(`flat-approvals-${flatId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visitor_requests" },
        () => qc.invalidateQueries({ queryKey: queryKeys.approvals(flatId) }),
      )
      .subscribe((status) => setRealtimeHealthy(status === "SUBSCRIBED"));
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, flatId, qc]);

  return query;
}

/** One request with visitor details — the full-screen approval view. */
export function useVisitorRequest(requestId: string | undefined) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: queryKeys.visitorRequest(requestId),
    enabled: !!requestId,
    refetchInterval: 5_000, // status can flip via realtime elsewhere; keep fresh
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visitor_requests")
        .select(
          "id,status,created_at,decided_at,handling,visitor:visitors!inner(id,name,phone,type,flat_id,photo_url,vehicle_no,flat:flats(number,tower:towers(name)))",
        )
        .eq("id", requestId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        status: toRequestStatus(data.status),
        visitor: {
          ...data.visitor,
          type: toVisitorType(data.visitor.type),
        },
      };
    },
  });
}

/** Approve / deny with optimistic UI + haptics. */
export function useDecide() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);

  return useMutation({
    mutationFn: async ({
      requestId,
      decision,
    }: {
      requestId: string;
      decision: "approved" | "denied";
    }) => {
      ({ requestId, decision } = parseInput(visitorDecisionSchema, {
        requestId,
        decision,
      }));
      const idempotencyKey = newQueueId();
      const queuedAction: NewQueuedGateAction = {
        kind: "decide_request",
        userId: profile!.id,
        societyId: profile!.society_id,
        payload: { requestId, decision },
      };
      if (!(await isOnlineNow())) {
        enqueueGateAction(queuedAction, idempotencyKey);
        return { queued: true };
      }
      gateBreadcrumb("resident decision", { requestId, decision });
      const { data, error } = await supabase.rpc("decide_visitor_request", {
        p_idempotency_key: idempotencyKey,
        p_request_id: requestId,
        p_decision: decision,
      });
      if (error) {
        if (enqueueAmbiguousFailure(queuedAction, idempotencyKey, error)) {
          return { queued: true };
        }
        throw error;
      }
      if (!privilegedRpcResultSchema.safeParse(data).success) {
        throw new Error("This request was already handled or is no longer available.");
      }
    },
    onMutate: async ({ requestId }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await qc.cancelQueries({ queryKey: ["approvals"] });
      qc.setQueriesData(
        { queryKey: ["approvals"] },
        (old: VisitorRequestRow[] | undefined) =>
          old?.filter((r) => r.id !== requestId),
      );
    },
    onSettled: (_d, _e, { requestId }) => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
      qc.invalidateQueries({ queryKey: queryKeys.visitorRequest(requestId) });
    },
  });
}

export type RaiseResult =
  | {
      requestId: string;
      status: RequestStatus;
      duplicate?: boolean;
      queued?: false;
      training?: false;
    }
  | { queued: true }
  | { training: true };

/** Guard: raise a new visitor + approval request in one shot.
 *  Offline-safe (ticket #5) and training-mode aware (ticket #17). */
export function useRaiseRequest() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);

  return useMutation({
    mutationFn: async (input: {
      name: string;
      phone?: string;
      vehicleNo?: string;
      type: VisitorType;
      flatId: string;
      photoUrl?: string;
    }): Promise<RaiseResult> => {
      const parsed = parseInput(newVisitorSchema, input);
      const idempotencyKey = newQueueId();

      if (usePrefs.getState().trainingMode) {
        gateBreadcrumb("training: raise simulated", { type: parsed.type });
        return { training: true };
      }

      if (!(await isOnlineNow())) {
        useOfflineQueue.getState().enqueue(
          makeQueuedAction(
            {
              kind: "raise_visitor",
              userId: profile!.id,
              societyId: profile!.society_id,
              payload: {
                flatId: parsed.flatId,
                type: parsed.type,
                name: parsed.name,
                phone: parsed.phone || undefined,
                vehicleNo: parsed.vehicleNo || undefined,
                photoUrl: parsed.photoUrl || undefined,
              },
            },
            idempotencyKey,
          ),
        );
        gateBreadcrumb("raise queued offline", { type: parsed.type });
        return { queued: true };
      }

      gateBreadcrumb("raise visitor", { type: parsed.type, flatId: parsed.flatId });
      const { data, error } = await supabase.rpc("raise_visitor_request", {
        p_idempotency_key: idempotencyKey,
        p_flat_id: parsed.flatId,
        p_name: parsed.name,
        p_type: parsed.type,
        p_phone: parsed.phone ?? undefined,
        p_vehicle_no: parsed.vehicleNo || undefined,
        p_photo_url: parsed.photoUrl ?? undefined,
      });
      if (error) {
        if (
          enqueueAmbiguousFailure(
            {
              kind: "raise_visitor",
              userId: profile!.id,
              societyId: profile!.society_id,
              payload: {
                flatId: parsed.flatId,
                type: parsed.type,
                name: parsed.name,
                phone: parsed.phone || undefined,
                vehicleNo: parsed.vehicleNo || undefined,
                photoUrl: parsed.photoUrl || undefined,
              },
            },
            idempotencyKey,
            error,
          )
        ) {
          return { queued: true };
        }
        throw error;
      }
      return parseInput(raiseVisitorResultSchema, data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gate"] }),
  });
}

/** Guard: retry an expired request — raises a fresh request for the same
 *  visitor (review §5.5 "finish the escalation story"). */
export function useRetryRequest() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async ({ visitorId }: { visitorId: string }) => {
      ({ visitorId } = parseInput(visitorIdSchema, { visitorId }));
      const idempotencyKey = newQueueId();
      const queuedAction: NewQueuedGateAction = {
        kind: "retry_request",
        userId: profile!.id,
        societyId: profile!.society_id,
        payload: { visitorId },
      };
      if (!(await isOnlineNow())) {
        enqueueGateAction(queuedAction, idempotencyKey);
        return { queued: true };
      }
      gateBreadcrumb("retry expired request", { visitorId });
      const { data, error } = await supabase.rpc("retry_visitor_request", {
        p_idempotency_key: idempotencyKey,
        p_visitor_id: visitorId,
      });
      if (error) {
        if (enqueueAmbiguousFailure(queuedAction, idempotencyKey, error)) {
          return { queued: true };
        }
        throw error;
      }
      return { ...parseInput(retryVisitorResultSchema, data), queued: false as const };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gate"] }),
  });
}

export interface ExpectedPassRow {
  id: string;
  visitor_name: string;
  type: VisitorType;
  valid_to: string;
  flat: { number: string } | null;
}

export interface GateRequestRow {
  id: string;
  status: RequestStatus;
  decided_by: string | null;
  created_at: string;
  visitor: {
    id: string;
    name: string;
    type: VisitorType;
    vehicle_no: string | null;
    flat_id: string;
    flat: { number: string } | null;
  };
}

export interface GateInsideRow {
  id: string;
  entry_at: string;
  expected_exit_at: string | null;
  method: string;
  visitor: {
    name: string;
    type: VisitorType;
    flat: { number: string } | null;
  };
}

/** Guard: live gate view — pending/decided requests, people inside, and
 *  today's expected pre-approved visitors (review §5.1). */
export function useGateBoard() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  const [realtimeHealthy, setRealtimeHealthy] = useState(false);
  const refresh = useCallback(
    () => void qc.invalidateQueries({ queryKey: queryKeys.gate(societyId) }),
    [qc, societyId],
  );
  useRealtimeRefreshPolicy({ healthy: realtimeHealthy, refresh });

  const query = useQuery({
    queryKey: queryKeys.gate(societyId),
    enabled: !!societyId,
    queryFn: async () => {
      const now = new Date().toISOString();
      const [pending, inside, expected] = await Promise.all([
        supabase
          .from("visitor_requests")
          .select(
            "id,status,decided_by,created_at,visitor:visitors!inner(id,name,type,vehicle_no,flat_id,flat:flats(number))",
          )
          .in("status", ["pending", "approved", "denied", "expired"])
          .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("gate_logs")
          .select(
            "id,entry_at,expected_exit_at,method,visitor:visitors!inner(name,type,flat:flats(number))",
          )
          .is("exit_at", null)
          .order("entry_at", { ascending: false }),
        supabase
          .from("pre_approvals")
          .select("id,visitor_name,type,valid_to,flat:flats(number)")
          .is("used_at", null)
          .is("revoked_at", null)
          .lte("valid_from", now)
          .gte("valid_to", now)
          .order("valid_to")
          .limit(20),
      ]);
      if (pending.error) throw pending.error;
      if (inside.error) throw inside.error;
      if (expected.error) throw expected.error;
      return {
        pending: pending.data.map((row): GateRequestRow => ({
          ...row,
          status: toRequestStatus(row.status),
          visitor: { ...row.visitor, type: toVisitorType(row.visitor.type) },
        })),
        inside: inside.data.map((row): GateInsideRow => ({
          ...row,
          visitor: { ...row.visitor, type: toVisitorType(row.visitor.type) },
        })),
        expected: expected.data.map((row): ExpectedPassRow => ({
          ...row,
          type: toVisitorType(row.type),
        })),
      };
    },
  });

  useEffect(() => {
    if (!societyId) return;
    const ch = supabase
      .channel(`gate-${societyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visitor_requests" },
        () => qc.invalidateQueries({ queryKey: queryKeys.gate(societyId) }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gate_logs" },
        () => qc.invalidateQueries({ queryKey: queryKeys.gate(societyId) }),
      )
      .subscribe((status) => setRealtimeHealthy(status === "SUBSCRIBED"));
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, societyId, qc]);

  return query;
}

/** Guard: mark entry (from an approved request) or exit.
 *  Offline-safe and training-mode aware. */
export function useGateActions() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);

  const markEntry = useMutation({
    mutationFn: async ({
      requestId,
    }: {
      requestId: string;
    }): Promise<{ queued?: boolean; training?: boolean }> => {
      ({ requestId } = parseInput(requestIdSchema, { requestId }));
      if (usePrefs.getState().trainingMode) return { training: true };
      const idempotencyKey = newQueueId();
      const queuedAction: NewQueuedGateAction = {
        kind: "mark_entry",
        userId: profile!.id,
        societyId: profile!.society_id,
        payload: { requestId },
      };
      if (!(await isOnlineNow())) {
        enqueueGateAction(queuedAction, idempotencyKey);
        return { queued: true };
      }
      gateBreadcrumb("mark entry", { requestId });
      const { data, error } = await supabase.rpc("mark_visitor_entry", {
        p_idempotency_key: idempotencyKey,
        p_request_id: requestId,
      });
      if (error) {
        if (enqueueAmbiguousFailure(queuedAction, idempotencyKey, error)) {
          return { queued: true };
        }
        throw error;
      }
      parseInput(markEntryResultSchema, data);
      return {};
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gate"] }),
  });

  const markExit = useMutation({
    mutationFn: async ({
      logId,
    }: {
      logId: string;
    }): Promise<{ queued?: boolean; training?: boolean }> => {
      ({ logId } = parseInput(logIdSchema, { logId }));
      if (usePrefs.getState().trainingMode) return { training: true };
      const idempotencyKey = newQueueId();
      const queuedAction: NewQueuedGateAction = {
        kind: "mark_exit",
        userId: profile!.id,
        societyId: profile!.society_id,
        payload: { logId },
      };
      if (!(await isOnlineNow())) {
        enqueueGateAction(queuedAction, idempotencyKey);
        return { queued: true };
      }
      gateBreadcrumb("mark exit", { logId });
      const { data, error } = await supabase.rpc("mark_visitor_exit", {
        p_idempotency_key: idempotencyKey,
        p_log_id: logId,
      });
      if (error) {
        if (enqueueAmbiguousFailure(queuedAction, idempotencyKey, error)) {
          return { queued: true };
        }
        throw error;
      }
      parseInput(markExitResultSchema, data);
      return {};
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gate"] }),
  });

  return { markEntry, markExit };
}

/** Admin: let a visitor in with a mandatory audited reason (ticket #14). */
export function useAdminOverride() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async ({ requestId, reason }: { requestId: string; reason: string }) => {
      ({ requestId, reason } = parseInput(adminOverrideSchema, {
        requestId,
        reason,
      }));
      const idempotencyKey = newQueueId();
      const queuedAction: NewQueuedGateAction = {
        kind: "admin_override",
        userId: profile!.id,
        societyId: profile!.society_id,
        payload: { requestId, reason },
      };
      if (!(await isOnlineNow())) {
        enqueueGateAction(queuedAction, idempotencyKey);
        return { queued: true } as const;
      }
      gateBreadcrumb("admin override", { requestId });
      const { data, error } = await supabase.rpc("admin_override_entry", {
        p_idempotency_key: idempotencyKey,
        p_request_id: requestId,
        p_reason: reason,
      });
      if (error) {
        if (enqueueAmbiguousFailure(queuedAction, idempotencyKey, error)) {
          return { queued: true } as const;
        }
        throw error;
      }
      return parseInput(adminOverrideResultSchema, data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gate"] });
      qc.invalidateQueries({ queryKey: ["visitor-history"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
  });
}

/** Flat policy used to predict the server's auto-approval result. */
export function useFlatAutoApprovalSettings(flatId: string | undefined) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["flat-auto-approval-settings", flatId],
    enabled: !!flatId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flats")
        .select("settings")
        .eq("id", flatId!)
        .single();
      if (error) throw error;
      return (data.settings ?? {}) as { noAutoApproveTypes?: VisitorType[] };
    },
  });
}

/** Flat search for the guard's New Visitor screen. */
export function useFlatSearch(term: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["flat-search", term],
    enabled: term.length >= 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flats")
        .select("id,number,tower:towers(name)")
        .ilike("number", `%${term}%`)
        .limit(8);
      if (error) throw error;
      return data;
    },
  });
}

/** Frequent-visitor suggestions while the guard types a name (review §5.3). */
export function useRecentVisitorSearch(term: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["recent-visitor-search", term],
    enabled: term.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visitors")
        .select("id,name,type,phone,vehicle_no,flat_id,flat:flats(id,number)")
        .ilike("name", `%${term.trim()}%`)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      // de-dup by name+flat so repeat visitors show once
      const seen = new Set<string>();
      return data
        .map((visitor) => ({
          ...visitor,
          type: toVisitorType(visitor.type),
        }))
        .filter((v) => {
        const key = `${v.name}|${v.flat_id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
        });
    },
  });
}

/** Visitor entry/exit history. RLS scopes rows: residents see their flat,
 *  guards/admins see the whole society. Paginated (ticket #12). */
export interface GateLogRow {
  id: string;
  entry_at: string;
  expected_exit_at?: string | null;
  exit_at: string | null;
  method: string;
  override_reason?: string | null;
  visitor: {
    name: string;
    phone: string | null;
    type: VisitorType;
    flat?: { number: string; tower?: { name: string } | null } | null;
  };
}

const HISTORY_PAGE = 30;

export function useVisitorHistory(days = 90) {
  const supabase = useSupabase();
  const profile = useSessionStore((s) => s.profile);

  return useInfiniteQuery({
    queryKey: ["visitor-history", profile?.id, days],
    enabled: !!profile,
    initialPageParam: 0,
    getNextPageParam: (last: GateLogRow[], all) =>
      last.length === HISTORY_PAGE ? all.length * HISTORY_PAGE : undefined,
    queryFn: async ({ pageParam }) => {
      const since = new Date(
        Date.now() - days * 24 * 60 * 60 * 1000,
      ).toISOString();
      const { data, error } = await supabase
        .from("gate_logs")
        .select(
          "id,entry_at,exit_at,method,override_reason,visitor:visitors!inner(name,phone,type,flat:flats(number,tower:towers(name)))",
        )
        .gte("entry_at", since)
        .order("entry_at", { ascending: false })
        .range(pageParam, pageParam + HISTORY_PAGE - 1);
      if (error) throw error;
      return data as unknown as GateLogRow[];
    },
  });
}

/** Resident: "my visitors inside now" strip on Home (review §5.3). */
export function useMyFlatInsideNow() {
  const supabase = useSupabase();
  const profile = useSessionStore((s) => s.profile);
  return useQuery({
    queryKey: ["inside-now", profile?.flat_id],
    enabled: !!profile?.flat_id,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gate_logs")
        .select("id,entry_at,visitor:visitors!inner(name,type,flat_id)")
        .eq("visitor.flat_id", profile!.flat_id!)
        .is("exit_at", null)
        .order("entry_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data.map((row) => ({
        ...row,
        visitor: { ...row.visitor, type: toVisitorType(row.visitor.type) },
      }));
    },
  });
}

/** Resident search for the guard's New Visitor screen (name → flat). */
export function useResidentSearch(term: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["resident-search", term],
    enabled: term.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,name,flat:flats(id,number,tower:towers(name))")
        .eq("role", "resident")
        .not("flat_id", "is", null)
        .ilike("name", `%${term.trim()}%`)
        .limit(8);
      if (error) throw error;
      return data as unknown as {
        id: string;
        name: string;
        flat: { id: string; number: string; tower?: { name: string } | null } | null;
      }[];
    },
  });
}
