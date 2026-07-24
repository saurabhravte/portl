import { captureError } from "../sentry";
import {
  mutationErrorMessage,
  queryKeys,
  reportMutationError,
} from "../queryState";

jest.mock("../sentry", () => ({ captureError: jest.fn() }));

describe("query state helpers", () => {
  it("creates stable tenant-scoped keys with explicit empty values", () => {
    expect(queryKeys.gate("society-a")).toEqual(["gate", "society-a"]);
    expect(queryKeys.gate(undefined)).toEqual(["gate", null]);
    expect(queryKeys.notifications("user-a")).toEqual([
      "notifications",
      "user-a",
    ]);
    expect(queryKeys.tickets("resident", "flat-a")).toEqual([
      "tickets",
      "resident",
      "flat-a",
      "all",
    ]);
  });

  it("normalizes thrown and PostgREST-shaped errors", () => {
    expect(mutationErrorMessage(new Error("Network unavailable"))).toBe(
      "Network unavailable",
    );
    expect(mutationErrorMessage({ message: "Permission denied" })).toBe(
      "Permission denied",
    );
    expect(mutationErrorMessage(null, "Fallback")).toBe("Fallback");
  });

  it("reports mutation failures with operation context", () => {
    const error = new Error("Failed");
    expect(reportMutationError("mark-entry", error, { requestId: "request-a" })).toBe(
      "Failed",
    );
    expect(captureError).toHaveBeenCalledWith(error, {
      operation: "mark-entry",
      requestId: "request-a",
    });
  });
});
