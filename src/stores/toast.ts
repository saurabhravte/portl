import { create } from "zustand";

export type ToastTone = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Auto-dismiss ms; default 3200. */
  durationMs?: number;
}

interface ToastState {
  items: ToastItem[];
  push: (
    tone: ToastTone,
    message: string,
    opts?: {
      actionLabel?: string;
      onAction?: () => void;
      durationMs?: number;
    },
  ) => number;
  dismiss: (id: number) => void;
}

let seq = 0;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export const useToastStore = create<ToastState>((set, get) => ({
  items: [],
  push: (tone, message, opts) => {
    const id = ++seq;
    const durationMs = opts?.durationMs ?? 3200;
    set((s) => ({
      items: [
        ...s.items,
        {
          id,
          tone,
          message,
          actionLabel: opts?.actionLabel,
          onAction: opts?.onAction,
          durationMs,
        },
      ],
    }));
    const timer = setTimeout(() => {
      timers.delete(id);
      get().dismiss(id);
    }, durationMs);
    timers.set(id, timer);
    return id;
  },
  dismiss: (id) => {
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
    set((s) => ({ items: s.items.filter((t) => t.id !== id) }));
  },
}));

/**
 * Fire-and-forget toast helper usable outside React (e.g. mutation onSuccess).
 * `toast.success("Saved")`, `toast.error(toErrorMessage(e))`.
 */
export const toast = {
  success: (message: string) => useToastStore.getState().push("success", message),
  error: (message: string) => useToastStore.getState().push("error", message),
  info: (message: string) => useToastStore.getState().push("info", message),
  /** Actionable toast (e.g. Undo). Returns toast id. */
  action: (
    message: string,
    actionLabel: string,
    onAction: () => void,
    durationMs = 5000,
  ) =>
    useToastStore.getState().push("info", message, {
      actionLabel,
      onAction,
      durationMs,
    }),
};
