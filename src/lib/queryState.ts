import { captureError } from "./sentry";

export const queryKeys = {
  gate: (societyId?: string | null) => ["gate", societyId ?? null] as const,
  approvals: (flatId?: string | null) => ["approvals", flatId ?? null] as const,
  visitorRequest: (requestId?: string | null) =>
    ["visitor-request", requestId ?? null] as const,
  notifications: (userId?: string | null) =>
    ["notifications", userId ?? null] as const,
  tickets: (
    role?: string | null,
    flatId?: string | null,
    status = "all",
  ) => ["tickets", role ?? null, flatId ?? null, status] as const,
};

export function mutationErrorMessage(error: unknown, fallback = "Try again.") {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message;
  }
  return fallback;
}

export function reportMutationError(
  operation: string,
  error: unknown,
  context?: Record<string, unknown>,
) {
  captureError(error, { operation, ...context });
  return mutationErrorMessage(error);
}
