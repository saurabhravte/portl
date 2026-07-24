import {
  chunk,
  classifyExpoError,
  classifyHttp,
  expoReceiptsResponseSchema,
  expoTicketsResponseSchema,
  isExpoPushToken,
  pushOutboxRowsSchema,
  retryAt,
  safeErrorMessage,
} from "./push.ts";
import { parseJsonResponse } from "./validation.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("validates Expo push token shape", () => {
  assert(isExpoPushToken("ExponentPushToken[abc_123-XYZ]"), "legacy token");
  assert(isExpoPushToken("ExpoPushToken[abc_123-XYZ]"), "current token");
  assert(!isExpoPushToken("abc_123"), "rejects opaque native token");
});

Deno.test("chunks within provider limits", () => {
  const batches = chunk(Array.from({ length: 201 }, (_, index) => index), 100);
  assert(batches.length === 3, "three batches");
  assert(batches[0].length === 100, "first capped at 100");
  assert(batches[2].length === 1, "remainder retained");
});

Deno.test("classifies retryable provider failures", () => {
  assert(classifyHttp(429).retryable, "rate limits retry");
  assert(classifyHttp(503).retryable, "server errors retry");
  assert(!classifyHttp(400).retryable, "bad requests are permanent");
  assert(
    classifyExpoError("ticket", "MessageRateExceeded").retryable,
    "ticket rate errors retry",
  );
  assert(
    !classifyExpoError("receipt", "DeviceNotRegistered").retryable,
    "invalid devices are permanent",
  );
});

Deno.test("uses capped exponential backoff with bounded jitter", () => {
  const now = Date.parse("2026-07-19T00:00:00.000Z");
  const first = Date.parse(retryAt(1, now, () => 0));
  const capped = Date.parse(retryAt(99, now, () => 1));
  assert(first - now === 5_000, "first retry is five seconds");
  assert(capped - now === 18.75 * 60_000, "cap plus max jitter");
});

Deno.test("redacts tokens from persisted errors", () => {
  const message = safeErrorMessage({
    retryable: false,
    errorClass: "ticket",
    code: "bad",
    message: "Rejected ExpoPushToken[secret-token]",
  });
  assert(!message.includes("secret-token"), "token is redacted");
});

Deno.test("rejects malformed Expo ticket responses", async () => {
  const malformed = new Response(JSON.stringify({
    data: [{ status: "ok" }],
  }));
  assert(
    await parseJsonResponse(malformed, expoTicketsResponseSchema) === null,
    "missing ticket id",
  );
  assert(
    !expoTicketsResponseSchema.safeParse({
      data: [{ status: "unexpected", id: crypto.randomUUID() }],
    }).success,
    "invalid status",
  );
});

Deno.test("rejects malformed Expo receipt responses", async () => {
  const malformed = new Response(JSON.stringify({
    data: {
      [crypto.randomUUID()]: {
        status: "error",
        details: { error: "DeviceNotRegistered", token: "must-not-be-accepted" },
      },
    },
  }));
  assert(
    await parseJsonResponse(malformed, expoReceiptsResponseSchema) === null,
    "unknown receipt fields",
  );
});

Deno.test("enforces claimed row UUID, attempts, token and payload bounds", () => {
  const base = {
    id: crypto.randomUUID(),
    expo_push_token: "ExpoPushToken[valid]",
    payload: { title: "Hello" },
    attempts: 1,
  };
  assert(pushOutboxRowsSchema.safeParse([base]).success, "valid row");
  assert(
    !pushOutboxRowsSchema.safeParse([{ ...base, id: "bad" }]).success,
    "invalid uuid",
  );
  assert(
    !pushOutboxRowsSchema.safeParse([{ ...base, attempts: 101 }]).success,
    "attempt bound",
  );
  assert(
    !pushOutboxRowsSchema.safeParse([{
      ...base,
      payload: { body: "x".repeat(5000) },
    }]).success,
    "payload bound",
  );
});
