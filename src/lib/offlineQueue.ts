import { z } from "zod";

export type QueueScope = {
  userId: string;
  societyId: string;
};

type QueueBase = QueueScope & {
  id: string;
  idempotencyKey: string;
  queuedAt: string;
  attempts: number;
  status: "pending" | "dead";
  lastError?: string;
};

export const GATE_QUEUE_VERSION = 1;
export const GATE_QUEUE_TTL_MS = 72 * 60 * 60 * 1000;
export const GATE_QUEUE_MAX_ITEMS = 50;
export const GATE_QUEUE_MAX_BYTES = 128 * 1024;
export const GATE_QUEUE_ENVELOPE_VERSION = 1;

const uuid = z.uuid();
const userId = z.string().trim().min(3).max(128).regex(/^[A-Za-z0-9_-]+$/);
const queueBaseSchema = z.strictObject({
  id: uuid,
  idempotencyKey: uuid,
  queuedAt: z.iso.datetime({ offset: true }),
  attempts: z.number().int().min(0).max(100),
  status: z.enum(["pending", "dead"]),
  userId,
  societyId: uuid,
  lastError: z.string().max(160).optional(),
});
const raisePayloadSchema = z.strictObject({
  flatId: uuid,
  type: z.enum(["guest", "delivery", "cab", "service"]),
  name: z.string().trim().min(2).max(80),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/).optional(),
  vehicleNo: z.string().trim().max(16).optional(),
  photoUrl: z.string().trim().max(2048).optional(),
});
export const queuedGateActionSchema = z.discriminatedUnion("kind", [
  queueBaseSchema.extend({ kind: z.literal("raise_visitor"), payload: raisePayloadSchema }),
  queueBaseSchema.extend({ kind: z.literal("mark_entry"), payload: z.strictObject({ requestId: uuid }) }),
  queueBaseSchema.extend({ kind: z.literal("mark_exit"), payload: z.strictObject({ logId: uuid }) }),
  queueBaseSchema.extend({ kind: z.literal("retry_request"), payload: z.strictObject({ visitorId: uuid }) }),
  queueBaseSchema.extend({
    kind: z.literal("decide_request"),
    payload: z.strictObject({ requestId: uuid, decision: z.enum(["approved", "denied"]) }),
  }),
  queueBaseSchema.extend({
    kind: z.literal("admin_override"),
    payload: z.strictObject({
      requestId: uuid,
      reason: z.string().trim().min(5).max(500),
    }),
  }),
]);
const queueStateSchema = z.strictObject({
  version: z.literal(GATE_QUEUE_VERSION),
  state: z.strictObject({
    items: z.array(queuedGateActionSchema).max(GATE_QUEUE_MAX_ITEMS),
  }),
});
const encryptedEnvelopeSchema = z.strictObject({
  version: z.literal(GATE_QUEUE_ENVELOPE_VERSION),
  ciphertext: z.string().min(16).max(GATE_QUEUE_MAX_BYTES * 2).regex(/^[A-Za-z0-9+/]+={0,2}$/),
});

export type QueuedGateAction =
  | (QueueBase & {
      kind: "raise_visitor";
      payload: {
        flatId: string;
        type: string;
        name: string;
        phone?: string;
        vehicleNo?: string;
        photoUrl?: string;
      };
    })
  | (QueueBase & {
      kind: "mark_entry";
      payload: { requestId: string };
    })
  | (QueueBase & {
      kind: "mark_exit";
      payload: { logId: string };
    })
  | (QueueBase & {
      kind: "retry_request";
      payload: { visitorId: string };
    })
  | (QueueBase & {
      kind: "decide_request";
      payload: { requestId: string; decision: "approved" | "denied" };
    })
  | (QueueBase & {
      kind: "admin_override";
      payload: { requestId: string; reason: string };
    });

export type NewQueuedGateAction = QueueScope &
  (
    | {
        kind: "raise_visitor";
        payload: {
          flatId: string;
          type: string;
          name: string;
          phone?: string;
          vehicleNo?: string;
          photoUrl?: string;
        };
      }
    | { kind: "mark_entry"; payload: { requestId: string } }
    | { kind: "mark_exit"; payload: { logId: string } }
    | { kind: "retry_request"; payload: { visitorId: string } }
    | {
        kind: "decide_request";
        payload: { requestId: string; decision: "approved" | "denied" };
      }
    | {
        kind: "admin_override";
        payload: { requestId: string; reason: string };
      }
  );

export function isInQueueScope(item: QueueScope, scope: QueueScope | null) {
  return (
    !!scope &&
    item.userId === scope.userId &&
    item.societyId === scope.societyId
  );
}

export function scopedQueue(
  items: QueuedGateAction[],
  scope: QueueScope | null,
) {
  return items.filter((item) => isInQueueScope(item, scope));
}

const PERMANENT_CODES = new Set([
  "22023",
  "23503",
  "23514",
  "42501",
  "P0001",
  "P0002",
]);

export function isPermanentQueueError(error: unknown) {
  const value = error as { code?: string; message?: string } | null;
  if (value?.code && PERMANENT_CODES.has(value.code)) return true;
  return /not found|not permitted|invalid|already exited|not approved|different society/i.test(
    value?.message ?? "",
  );
}

export function isAmbiguousQueueError(error: unknown) {
  if (isPermanentQueueError(error)) return false;
  const value = error as {
    code?: string;
    message?: string;
    status?: number;
  } | null;
  if (value?.status && value.status >= 400 && value.status < 500) return false;
  return /network|fetch|timeout|timed out|abort|connection|offline|unavailable|gateway|5\d\d/i.test(
    `${value?.code ?? ""} ${value?.message ?? ""}`,
  );
}

export function queueErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  const value = error as { message?: string } | null;
  return value?.message ?? "Unknown replay error";
}

/** Stable UUID-shaped key for OS events that may be delivered more than once. */
export function idempotencyKeyFromString(value: string) {
  const chunks = [2166136261, 2246822519, 3266489917, 668265263].map(
    (seed) => {
      let hash = seed >>> 0;
      for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619) >>> 0;
      }
      return hash.toString(16).padStart(8, "0");
    },
  );
  const hex = chunks.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function makeQueuedAction(
  action: NewQueuedGateAction,
  id: string,
  now = new Date().toISOString(),
): QueuedGateAction {
  return queuedGateActionSchema.parse({
    ...action,
    id,
    idempotencyKey: id,
    queuedAt: now,
    attempts: 0,
    status: "pending",
  }) as QueuedGateAction;
}

export function makeAmbiguousFailureReplay(
  action: NewQueuedGateAction,
  idempotencyKey: string,
  error: unknown,
  now?: string,
) {
  return isAmbiguousQueueError(error)
    ? makeQueuedAction(action, idempotencyKey, now)
    : null;
}

function truncate(value: string, max: number) {
  return value.trim().slice(0, max);
}

/** Removes optional PII and bounds free-form fields before persistence. */
export function minimizeQueuedAction(
  item: QueuedGateAction,
): QueuedGateAction {
  const base = {
    ...item,
    lastError: item.lastError
      ? truncate(
          item.lastError
            .replace(/https?:\/\/\S+/gi, "[link]")
            .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/gi, "[email]")
            .replace(/\+?\d[\d\s()-]{7,}\d/g, "[phone]"),
          160,
        )
      : undefined,
  };
  if (item.kind === "raise_visitor") {
    return {
      ...base,
      kind: item.kind,
      payload: {
        flatId: item.payload.flatId,
        type: truncate(item.payload.type, 24),
        name: truncate(item.payload.name, 80),
      },
    };
  }
  if (item.kind === "admin_override") {
    return {
      ...base,
      kind: item.kind,
      payload: {
        requestId: item.payload.requestId,
        reason: truncate(item.payload.reason, 200),
      },
    };
  }
  return base;
}

export function utf8ByteLength(value: string) {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    bytes +=
      codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}

/** Applies TTL, minimization, count and byte bounds while preserving FIFO order. */
export function boundQueuedActions(
  items: QueuedGateAction[],
  now = Date.now(),
  limits: {
    ttlMs?: number;
    maxItems?: number;
    maxBytes?: number;
  } = {},
) {
  const ttlMs = limits.ttlMs ?? GATE_QUEUE_TTL_MS;
  const maxItems = limits.maxItems ?? GATE_QUEUE_MAX_ITEMS;
  const maxBytes = limits.maxBytes ?? GATE_QUEUE_MAX_BYTES;
  const live = items
    .filter((item) => {
      const queuedAt = Date.parse(item.queuedAt);
      return Number.isFinite(queuedAt) && now - queuedAt <= ttlMs;
    })
    .slice(-maxItems)
    .map(minimizeQueuedAction);

  while (live.length && utf8ByteLength(JSON.stringify(live)) > maxBytes) {
    live.shift();
  }
  return live;
}

export function serializeQueueState(
  state: { state?: { items?: QueuedGateAction[] }; version?: number },
  now = Date.now(),
) {
  return JSON.stringify({
    version: GATE_QUEUE_VERSION,
    state: {
      items: boundQueuedActions(state.state?.items ?? [], now),
    },
  });
}

export function parseQueueState(value: string, now = Date.now()) {
  if (utf8ByteLength(value) > GATE_QUEUE_MAX_BYTES) return null;
  try {
    const result = queueStateSchema.safeParse(JSON.parse(value));
    if (!result.success) return null;
    return JSON.stringify({
      version: GATE_QUEUE_VERSION,
      state: { items: boundQueuedActions(result.data.state.items, now) },
    });
  } catch {
    return null;
  }
}

export function makeEncryptedQueueEnvelope(ciphertext: string) {
  return JSON.stringify(encryptedEnvelopeSchema.parse({
    version: GATE_QUEUE_ENVELOPE_VERSION,
    ciphertext,
  }));
}

export function parseEncryptedQueueEnvelope(value: string) {
  if (utf8ByteLength(value) > GATE_QUEUE_MAX_BYTES * 2 + 100) return null;
  try {
    const result = encryptedEnvelopeSchema.safeParse(JSON.parse(value));
    if (!result.success) return null;
    return result.data.ciphertext;
  } catch {
    return null;
  }
}
