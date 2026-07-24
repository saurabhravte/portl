import {
  REALTIME_FALLBACK_MS,
  realtimeFallbackInterval,
} from "../realtimePolicy";

describe("realtime reconnect policy", () => {
  it("polls within the bounded window only while realtime is disconnected", () => {
    expect(REALTIME_FALLBACK_MS).toBeGreaterThanOrEqual(5_000);
    expect(REALTIME_FALLBACK_MS).toBeLessThanOrEqual(10_000);
    expect(realtimeFallbackInterval(false, true)).toBe(REALTIME_FALLBACK_MS);
    expect(realtimeFallbackInterval(true, true)).toBe(false);
    expect(realtimeFallbackInterval(false, false)).toBe(false);
  });
});
