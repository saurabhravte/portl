/**
 * Offline resilience for the gate (sprint ticket #5 — P0).
 *
 * "Guard phone offline" is a named top risk in the product plan: the gate
 * must never depend on perfect connectivity. Gate actions (new visitor,
 * mark entry, mark exit) taken while offline are queued locally
 * (AsyncStorage-persisted) and replayed in order on reconnect.
 */
import NetInfo from "@react-native-community/netinfo";
import { randomUUID } from "expo-crypto";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { encryptedGateQueueStorage } from "./encryptedQueueStorage";
import {
  boundQueuedActions,
  GATE_QUEUE_VERSION,
  isInQueueScope,
  isPermanentQueueError,
  queueErrorMessage,
  scopedQueue,
  type QueuedGateAction,
  type QueueScope,
} from "./offlineQueue";
import { captureError, gateBreadcrumb } from "./sentry";
import type { AppSupabaseClient } from "./supabase";
import {
  adminOverrideResultSchema,
  markEntryResultSchema,
  markExitResultSchema,
  parseInput,
  privilegedRpcResultSchema,
  raiseVisitorResultSchema,
  retryVisitorResultSchema,
} from "./validation";

export type { QueuedGateAction, QueueScope } from "./offlineQueue";

interface OfflineQueueState {
  items: QueuedGateAction[];
  scope: QueueScope | null;
  setScope: (scope: QueueScope | null) => void;
  enqueue: (item: QueuedGateAction) => void;
  remove: (id: string) => void;
  markFailed: (id: string, message: string, permanent: boolean) => void;
  retry: (id: string) => void;
  clear: () => void;
}

let hydrationScope: QueueScope | null = null;

export const useOfflineQueue = create<OfflineQueueState>()(
  persist(
    (set) => ({
      items: [],
      scope: null,
      setScope: (scope) =>
        set((state) => {
          if (
            state.scope?.userId === scope?.userId &&
            state.scope?.societyId === scope?.societyId
          ) {
            return { scope };
          }
          if (!state.scope && scope) {
            return {
              scope,
              items: state.items.filter((item) =>
                isInQueueScope(item, scope),
              ),
            };
          }
          // Never expose one account's queued visitor data to another account.
          return { scope, items: [] };
        }),
      enqueue: (item) =>
        set((s) => ({ items: boundQueuedActions([...s.items, item]) })),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      markFailed: (id, message, permanent) =>
        set((s) => ({
          items: s.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  attempts: item.attempts + 1,
                  lastError: message,
                  status: permanent ? "dead" : "pending",
                }
              : item,
          ),
        })),
      retry: (id) =>
        set((s) => ({
          items: s.items.map((item) =>
            item.id === id
              ? { ...item, status: "pending", lastError: undefined }
              : item,
          ),
        })),
      clear: () => set({ items: [] }),
    }),
    {
      name: "portl-gate-offline-queue",
      version: GATE_QUEUE_VERSION,
      storage: createJSONStorage(() => encryptedGateQueueStorage),
      // Identity comes from the live authenticated session, never storage.
      partialize: (state) => ({ items: state.items }),
      skipHydration: true,
      merge: (persisted, current) => {
        const saved = persisted as Partial<OfflineQueueState> | undefined;
        const scope = hydrationScope ?? current.scope;
        return {
          ...current,
          scope,
          items: scopedQueue(
            boundQueuedActions(saved?.items ?? []),
            scope,
          ),
        };
      },
      onRehydrateStorage: () => () => {
        hydrationScope = null;
      },
    },
  ),
);

/** Live connectivity state (drives the offline banner). */
export function useIsOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      setOnline(!!state.isConnected && state.isInternetReachable !== false);
    });
    return () => sub();
  }, []);
  return online;
}

export async function isOnlineNow(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return !!state.isConnected && state.isInternetReachable !== false;
}

let flushing = false;

/** Replay queued gate actions in order. Stops at the first failure so
 *  ordering (entry before exit) is preserved; retries on next reconnect. */
export async function flushGateQueue(supabase: AppSupabaseClient) {
  if (flushing) return;
  flushing = true;
  try {
    const { items, scope, remove, markFailed } = useOfflineQueue.getState();
    for (const item of scopedQueue(items, scope)) {
      if (item.status === "dead") continue;
      try {
        if (item.kind === "raise_visitor") {
          const { data, error } = await supabase.rpc("raise_visitor_request", {
            p_idempotency_key: item.idempotencyKey,
            p_flat_id: item.payload.flatId,
            p_name: item.payload.name,
            p_type: item.payload.type,
            p_phone: item.payload.phone ?? undefined,
            p_vehicle_no: item.payload.vehicleNo ?? undefined,
            p_photo_url: item.payload.photoUrl ?? undefined,
          });
          if (error) throw error;
          parseInput(raiseVisitorResultSchema, data);
        } else if (item.kind === "mark_entry") {
          const { data, error } = await supabase.rpc("mark_visitor_entry", {
            p_idempotency_key: item.idempotencyKey,
            p_request_id: item.payload.requestId,
          });
          if (error) throw error;
          parseInput(markEntryResultSchema, data);
        } else if (item.kind === "mark_exit") {
          const { data, error } = await supabase.rpc("mark_visitor_exit", {
            p_idempotency_key: item.idempotencyKey,
            p_log_id: item.payload.logId,
          });
          if (error) throw error;
          parseInput(markExitResultSchema, data);
        } else if (item.kind === "retry_request") {
          const { data, error } = await supabase.rpc("retry_visitor_request", {
            p_idempotency_key: item.idempotencyKey,
            p_visitor_id: item.payload.visitorId,
          });
          if (error) throw error;
          parseInput(retryVisitorResultSchema, data);
        } else if (item.kind === "decide_request") {
          const { data, error } = await supabase.rpc("decide_visitor_request", {
            p_idempotency_key: item.idempotencyKey,
            p_request_id: item.payload.requestId,
            p_decision: item.payload.decision,
          });
          if (error) throw error;
          parseInput(privilegedRpcResultSchema, data);
        } else if (item.kind === "admin_override") {
          const { data, error } = await supabase.rpc("admin_override_entry", {
            p_idempotency_key: item.idempotencyKey,
            p_request_id: item.payload.requestId,
            p_reason: item.payload.reason,
          });
          if (error) throw error;
          parseInput(adminOverrideResultSchema, data);
        }
        gateBreadcrumb("offline queue replayed", { kind: item.kind, id: item.id });
        remove(item.id);
      } catch (err) {
        captureError(err, { queuedAction: item.kind });
        const permanent = isPermanentQueueError(err);
        markFailed(item.id, queueErrorMessage(err), permanent);
        if (!permanent) break;
      }
    }
  } finally {
    flushing = false;
  }
}

/** Auto-flush the queue whenever connectivity returns. Mount once in the
 *  guard layout. */
export function useGateQueueAutoFlush(supabase: AppSupabaseClient) {
  const online = useIsOnline();
  const count = useOfflineQueue((s) => scopedQueue(s.items, s.scope).length);
  useEffect(() => {
    if (online && count > 0) flushGateQueue(supabase);
  }, [online, count, supabase]);
  return { online, queued: count };
}

/** Set from the authenticated guard shell. A changed/null identity purges data. */
export function setGateQueueScope(scope: QueueScope | null) {
  useOfflineQueue.getState().setScope(scope);
}

/** Auth/root integration point when sign-out or account switching is detected. */
export function clearGateQueueForSessionChange() {
  useOfflineQueue.getState().setScope(null);
  useOfflineQueue.getState().clear();
  void useOfflineQueue.persist.clearStorage();
}

export function getScopedGateQueue() {
  const { items, scope } = useOfflineQueue.getState();
  return scopedQueue(items, scope);
}

export const newQueueId = randomUUID;

export function useGateQueueScope(scope: QueueScope | null) {
  const userId = scope?.userId;
  const societyId = scope?.societyId;
  useEffect(() => {
    if (!userId || !societyId) return;
    const nextScope = { userId, societyId };
    if (!useOfflineQueue.persist.hasHydrated()) {
      hydrationScope = nextScope;
      void useOfflineQueue.persist.rehydrate();
    } else {
      setGateQueueScope(nextScope);
    }
  }, [societyId, userId]);
}
