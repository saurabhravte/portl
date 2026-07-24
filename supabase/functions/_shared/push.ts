import {
  attemptsSchema,
  boundedPayloadSchema,
  uuidSchema,
  z,
} from "./validation.ts";

export const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_RECEIPTS_URL =
  "https://exp.host/--/api/v2/push/getReceipts";

export type Failure = {
  retryable: boolean;
  errorClass: "network" | "http" | "ticket" | "receipt" | "validation";
  code: string;
  message: string;
};

const RETRYABLE_EXPO_ERRORS = new Set(["MessageRateExceeded"]);

export const expoPushTokenSchema = z.string().max(256).regex(
  /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/,
);

export function isExpoPushToken(token: unknown): token is string {
  return expoPushTokenSchema.safeParse(token).success;
}

const expoErrorDetailsSchema = z.object({
  error: z.string().trim().min(1).max(100),
}).strict();

const expoTicketSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    id: uuidSchema,
  }).strict(),
  z.object({
    status: z.literal("error"),
    message: z.string().max(500).optional(),
    details: expoErrorDetailsSchema.optional(),
  }).strict(),
]);

export const expoTicketsResponseSchema = z.object({
  data: z.array(expoTicketSchema).max(100),
}).strict();

const expoReceiptSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok") }).strict(),
  z.object({
    status: z.literal("error"),
    message: z.string().max(500).optional(),
    details: expoErrorDetailsSchema.optional(),
  }).strict(),
]);

export const expoReceiptsResponseSchema = z.object({
  data: z.record(uuidSchema, expoReceiptSchema),
}).strict().refine((value) => Object.keys(value.data).length <= 1000);

export const pushOutboxRowSchema = z.object({
  id: uuidSchema,
  expo_push_token: expoPushTokenSchema,
  payload: boundedPayloadSchema,
  attempts: attemptsSchema,
}).passthrough();

export const pushOutboxRowsSchema = z.array(pushOutboxRowSchema).max(100);

export const pushReceiptRowSchema = z.object({
  ticket_id: uuidSchema,
  outbox_id: uuidSchema,
  expo_push_token: expoPushTokenSchema,
  attempts: attemptsSchema,
}).passthrough();

export const pushReceiptRowsSchema = z.array(pushReceiptRowSchema).max(1000);

export function chunk<T>(values: T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error("invalid chunk size");
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export function classifyHttp(status: number): Failure {
  return {
    retryable: status === 429 || status >= 500,
    errorClass: "http",
    code: `http_${status}`,
    message: `Expo request failed (${status})`,
  };
}

export function classifyExpoError(
  kind: "ticket" | "receipt",
  code?: string,
  message?: string,
): Failure {
  const normalized = code || "UnknownExpoError";
  return {
    retryable: RETRYABLE_EXPO_ERRORS.has(normalized),
    errorClass: kind,
    code: normalized,
    message: message || normalized,
  };
}

export function classifyNetwork(error: unknown): Failure {
  const message = error instanceof Error ? error.message : "Network failure";
  return {
    retryable: true,
    errorClass: "network",
    code: "fetch_failed",
    message,
  };
}

export function retryAt(
  attempts: number,
  now = Date.now(),
  random = Math.random,
): string {
  const exponent = Math.min(Math.max(attempts - 1, 0), 8);
  const baseMs = Math.min(15 * 60_000, 5_000 * 2 ** exponent);
  const jitterMs = Math.floor(baseMs * 0.25 * Math.max(0, Math.min(1, random())));
  return new Date(now + baseMs + jitterMs).toISOString();
}

export function safeErrorMessage(failure: Failure): string {
  return failure.message.replace(
    /Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]/g,
    "[push-token]",
  ).slice(0, 500);
}

export function secretsMatch(actual: string, expected: string) {
  const left = new TextEncoder().encode(actual);
  const right = new TextEncoder().encode(expected);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}
