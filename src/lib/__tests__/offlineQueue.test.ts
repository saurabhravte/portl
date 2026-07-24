import {
  boundQueuedActions,
  idempotencyKeyFromString,
  isAmbiguousQueueError,
  isPermanentQueueError,
  makeAmbiguousFailureReplay,
  makeEncryptedQueueEnvelope,
  makeQueuedAction,
  minimizeQueuedAction,
  parseEncryptedQueueEnvelope,
  parseQueueState,
  queueErrorMessage,
  serializeQueueState,
  scopedQueue,
} from "../offlineQueue";

const scope = {
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  societyId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};
const requestId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const logId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const visitorId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const flatId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

describe("offline gate queue", () => {
  it("keeps persisted actions isolated to user and society", () => {
    const own = makeQueuedAction(
      {
        ...scope,
        kind: "mark_exit",
        payload: { logId },
      },
      "11111111-1111-4111-8111-111111111111",
    );
    const other = { ...own, id: "other", userId: "guard-b" };
    expect(scopedQueue([own, other], scope)).toEqual([own]);
    expect(scopedQueue([own], null)).toEqual([]);
  });

  it("uses the queue id as the stable replay idempotency key", () => {
    const action = makeQueuedAction(
      {
        ...scope,
        kind: "mark_entry",
        payload: { requestId },
      },
      "22222222-2222-4222-8222-222222222222",
      "2026-07-19T00:00:00.000Z",
    );
    expect(action.idempotencyKey).toBe(action.id);
    expect(action.attempts).toBe(0);
    expect(action.status).toBe("pending");
  });

  it("dead-letters authorization and invariant failures", () => {
    expect(isPermanentQueueError({ code: "42501" })).toBe(true);
    expect(isPermanentQueueError({ code: "23514" })).toBe(true);
    expect(isPermanentQueueError(new Error("visitor has already exited"))).toBe(
      true,
    );
    expect(isPermanentQueueError({ code: "503", message: "unavailable" })).toBe(
      false,
    );
  });

  it("keeps transient failures retryable and renders unknown failures safely", () => {
    expect(isPermanentQueueError({ code: "ETIMEDOUT", message: "timed out" })).toBe(
      false,
    );
    expect(queueErrorMessage({ message: "Gateway unavailable" })).toBe(
      "Gateway unavailable",
    );
    expect(queueErrorMessage("unexpected")).toBe("Unknown replay error");
  });

  it("preserves the same key when a timeout is queued for replay", () => {
    const key = "33333333-3333-4333-8333-333333333333";
    expect(isAmbiguousQueueError(new Error("Network request timed out"))).toBe(
      true,
    );
    const replay = makeAmbiguousFailureReplay(
      {
        ...scope,
        kind: "retry_request",
        payload: { visitorId },
      },
      key,
      new Error("Network request timed out"),
    );
    expect(replay?.idempotencyKey).toBe(key);
    expect(replay?.id).toBe(key);
    expect(
      makeAmbiguousFailureReplay(
        {
          ...scope,
          kind: "retry_request",
          payload: { visitorId },
        },
        key,
        { code: "42501", message: "not permitted" },
      ),
    ).toBeNull();
  });

  it("expires old items and enforces item bounds", () => {
    const now = Date.parse("2026-07-19T12:00:00.000Z");
    const items = Array.from({ length: 4 }, (_, index) =>
      makeQueuedAction(
        {
          ...scope,
          kind: "mark_exit",
          payload: { logId },
        },
        `44444444-4444-4444-8444-44444444444${index}`,
        index === 0
          ? "2026-07-15T00:00:00.000Z"
          : "2026-07-19T11:00:00.000Z",
      ),
    );
    expect(
      boundQueuedActions(items, now, {
        ttlMs: 24 * 60 * 60 * 1000,
        maxItems: 2,
      }).map((item) => item.id),
    ).toEqual([
      "44444444-4444-4444-8444-444444444442",
      "44444444-4444-4444-8444-444444444443",
    ]);
  });

  it("minimizes optional PII and stored error details", () => {
    const item = makeQueuedAction(
      {
        ...scope,
        kind: "raise_visitor",
        payload: {
          flatId,
          type: "guest",
          name: "Guest",
          phone: "+919999999999",
          vehicleNo: "MP09 AB 1234",
          photoUrl: "https://example.test/private.jpg",
        },
      },
      "55555555-5555-4555-8555-555555555555",
    );
    const minimized = minimizeQueuedAction({
      ...item,
      lastError: "Failed for +91 99999 99999 at https://example.test/private",
    });
    expect(minimized.kind === "raise_visitor" && minimized.payload.phone).toBe(
      undefined,
    );
    expect(minimized.lastError).not.toContain("99999");
    expect(minimized.lastError).not.toContain("https://");
  });

  it("serializes only current-version bounded state for hydration", () => {
    const own = makeQueuedAction(
      {
        ...scope,
        kind: "mark_entry",
        payload: { requestId },
      },
      "66666666-6666-4666-8666-666666666666",
      "2026-07-19T11:00:00.000Z",
    );
    const serialized = serializeQueueState(
      { state: { items: [own] } },
      Date.parse("2026-07-19T12:00:00.000Z"),
    );
    expect(
      parseQueueState(serialized, Date.parse("2026-07-19T12:00:00.000Z")),
    ).toBe(serialized);
    expect(scopedQueue([own], { userId: "other", societyId: "society-a" })).toEqual(
      [],
    );
  });

  it("wraps ciphertext without exposing queue plaintext", () => {
    const envelope = makeEncryptedQueueEnvelope("YmFzZTY0LWNpcGhlcnRleHQ=");
    expect(parseEncryptedQueueEnvelope(envelope)).toBe("YmFzZTY0LWNpcGhlcnRleHQ=");
    expect(envelope).not.toContain("visitor");
    expect(
      parseEncryptedQueueEnvelope(
        JSON.stringify({ version: 99, ciphertext: "old" }),
      ),
    ).toBeNull();
  });

  it.each([
    "{",
    "null",
    JSON.stringify({ version: 1, state: { items: "not-an-array" } }),
    JSON.stringify({
      version: 1,
      state: {
        items: [
          {
            id: "not-a-uuid",
            idempotencyKey: "not-a-uuid",
            queuedAt: "yesterday",
            attempts: -1,
            status: "pending",
            userId: "bad",
            societyId: "bad",
            kind: "mark_entry",
            payload: { requestId: "bad" },
          },
        ],
      },
    }),
  ])("rejects malformed persisted queue state", (value) => {
    expect(parseQueueState(value)).toBeNull();
  });

  it("rejects malformed and oversized encrypted envelopes", () => {
    expect(parseEncryptedQueueEnvelope("{")).toBeNull();
    expect(
      parseEncryptedQueueEnvelope(
        JSON.stringify({ version: 1, ciphertext: "not base64!" }),
      ),
    ).toBeNull();
    expect(
      parseEncryptedQueueEnvelope(
        JSON.stringify({ version: 1, ciphertext: "A".repeat(300_000) }),
      ),
    ).toBeNull();
  });

  it("derives a stable UUID key for repeated OS events", () => {
    const first = idempotencyKeyFromString("notification-1:approve");
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(idempotencyKeyFromString("notification-1:approve")).toBe(first);
    expect(idempotencyKeyFromString("notification-1:deny")).not.toBe(first);
  });
});
