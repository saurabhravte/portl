import { toast } from "@/stores/toast";

/** Mis-tap recovery window before Approve/Deny RPC fires. */
export const DECIDE_UNDO_MS = 5_000;

type PendingDecide = {
  cancelled: boolean;
  timer: ReturnType<typeof setTimeout>;
  resolve: (cancelled: boolean) => void;
};

const pendingDecides = new Map<string, PendingDecide>();

/** Test helper — clear in-flight undo windows between suites. */
export function resetDecideUndoForTests() {
  for (const [, entry] of pendingDecides) {
    clearTimeout(entry.timer);
    entry.cancelled = true;
    entry.resolve(true);
  }
  pendingDecides.clear();
}

/**
 * Optimistic Approve/Deny hold: returns true if the user tapped Undo
 * within DECIDE_UNDO_MS (RPC must not fire). Returns false when the
 * window elapses and the decision should commit.
 */
export function waitForDecideUndo(
  requestId: string,
  decision: "approved" | "denied",
  opts?: {
    undoMs?: number;
    showToast?: boolean;
  },
): Promise<boolean> {
  const undoMs = opts?.undoMs ?? DECIDE_UNDO_MS;
  const showToast = opts?.showToast ?? true;

  const existing = pendingDecides.get(requestId);
  if (existing) {
    clearTimeout(existing.timer);
    existing.cancelled = true;
    existing.resolve(true);
    pendingDecides.delete(requestId);
  }

  return new Promise((resolve) => {
    const entry: PendingDecide = {
      cancelled: false,
      resolve,
      timer: setTimeout(() => {
        pendingDecides.delete(requestId);
        resolve(false);
      }, undoMs),
    };
    pendingDecides.set(requestId, entry);

    if (showToast) {
      toast.action(
        decision === "approved"
          ? "Approved — tap Undo to cancel"
          : "Denied — tap Undo to cancel",
        "Undo",
        () => {
          cancelDecideUndo(requestId);
        },
        undoMs,
      );
    }
  });
}

/** Cancel a pending decide window (Undo tap or superseding decide). */
export function cancelDecideUndo(requestId: string): boolean {
  const pending = pendingDecides.get(requestId);
  if (!pending) return false;
  clearTimeout(pending.timer);
  pending.cancelled = true;
  pendingDecides.delete(requestId);
  pending.resolve(true);
  return true;
}
