/**
 * One place that turns any thrown value (PostgREST error, fetch failure,
 * Clerk auth error, plain Error) into a UX "kind" the state components can
 * render consistently. This is what makes Error / No-Internet / Permission /
 * Session-expired states behave the same everywhere in the app.
 */
export type ErrorKind =
  | "offline" // network unreachable / request failed
  | "session" // auth token missing or expired (401)
  | "permission" // RLS / role blocked the action (403 / 42501)
  | "notFound" // row/route not found
  | "unknown"; // anything else

export interface ClassifiedError {
  kind: ErrorKind;
  message: string;
}

function asRecord(e: unknown): Record<string, unknown> {
  return e && typeof e === "object" ? (e as Record<string, unknown>) : {};
}

function readMessage(e: unknown): string {
  const r = asRecord(e);
  if (typeof r.message === "string" && r.message.trim()) return r.message;
  if (typeof e === "string" && e.trim()) return e;
  return "Something went wrong.";
}

export function classifyError(e: unknown): ClassifiedError {
  const r = asRecord(e);
  const raw = readMessage(e);
  const msg = raw.toLowerCase();
  const code = String(r.code ?? "");
  const status = Number(r.status ?? r.statusCode ?? NaN);

  // Network / offline — fetch throws a TypeError with these messages.
  if (
    /network request failed|failed to fetch|network error|timed out|timeout|unable to connect|connection/i.test(
      msg,
    )
  ) {
    return { kind: "offline", message: "You appear to be offline." };
  }

  // Session / auth.
  if (
    status === 401 ||
    code === "PGRST301" ||
    /jwt|unauthenti|unauthorized|not authenticated|token (is )?expired|invalid session/i.test(
      msg,
    )
  ) {
    return {
      kind: "session",
      message: "Your session expired. Please sign in again.",
    };
  }

  // Permission / RLS. 42501 is Postgres "insufficient_privilege".
  if (
    status === 403 ||
    code === "42501" ||
    /permission denied|row-level security|violates row-level|not allowed|forbidden|insufficient/i.test(
      msg,
    )
  ) {
    return {
      kind: "permission",
      message: "You don’t have access to this.",
    };
  }

  // Not found.
  if (status === 404 || code === "PGRST116" || /not found|no rows/i.test(msg)) {
    return { kind: "notFound", message: "We couldn’t find that." };
  }

  return { kind: "unknown", message: raw };
}

/** Convenience for mutation onError → toast. */
export function toErrorMessage(e: unknown): string {
  return classifyError(e).message;
}
