import { z } from "zod";

/**
 * Result contract for the `claim_invite` RPC (migration 0038).
 *
 * Before 0038 the function raised on "no verified identity", "identity
 * mismatch" and "profile already exists". The client had no way to tell a
 * normal outcome from a real fault, so it rendered every one of them as
 * "Couldn't load your profile" with the raw Postgres string underneath.
 * Those three are now soft results and are handled here.
 */
export const CLAIM_REASONS = [
  "claimed",
  "already_linked",
  "identity_unverified",
  "identity_mismatch",
  "no_invite",
] as const;

export type ClaimReason = (typeof CLAIM_REASONS)[number];

/**
 * Tolerant on purpose. A device running an older build against a newer
 * database (or the reverse, mid-rollout) must not crash on an unknown reason
 * or on the legacy `true` / `{claimed:boolean}` shapes.
 */
export const inviteClaimResultSchema = z
  .union([
    z.literal(true),
    z
      .object({
        claimed: z.boolean().optional(),
        reason: z.string().optional(),
      })
      .passthrough(),
  ])
  .nullish();

export interface ParsedClaim {
  claimed: boolean;
  reason: ClaimReason | "unknown";
}

export function parseClaimResult(raw: unknown): ParsedClaim {
  const parsed = inviteClaimResultSchema.safeParse(raw);
  if (!parsed.success || parsed.data == null) {
    return { claimed: false, reason: "unknown" };
  }
  if (parsed.data === true) return { claimed: true, reason: "claimed" };

  const claimed = parsed.data.claimed === true;
  const reason = parsed.data.reason;
  const known = (CLAIM_REASONS as readonly string[]).includes(reason ?? "")
    ? (reason as ClaimReason)
    : claimed
      ? "claimed"
      : "unknown";

  return { claimed, reason: known };
}

/**
 * Fallback for the window where 0038 has not been applied yet: the old
 * function still raises, so classify the exception text instead of showing
 * it. `28000` is the errcode the legacy function used for the unverified
 * case, but PostgREST does not always preserve it, so match the message too.
 */
export function reasonFromLegacyError(error: unknown): ParsedClaim | null {
  const message =
    error && typeof error === "object"
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  const code =
    error && typeof error === "object"
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const lower = message.toLowerCase();

  if (lower.includes("profile already exists")) {
    return { claimed: false, reason: "already_linked" };
  }
  if (
    code === "28000" ||
    (lower.includes("verified") &&
      (lower.includes("phone") || lower.includes("email")) &&
      lower.includes("required"))
  ) {
    return { claimed: false, reason: "identity_unverified" };
  }
  if (lower.includes("does not match verified")) {
    return { claimed: false, reason: "identity_mismatch" };
  }
  return null;
}

/** Copy shown in the app shell. Never a raw database string. */
export function claimReasonCopy(reason: ClaimReason | "unknown"): {
  title: string;
  body: string;
} {
  switch (reason) {
    case "identity_unverified":
      return {
        title: "One quick step to join your society",
        body: "Verify an email address or phone number and we'll match you to your society's invitation automatically.",
      };
    case "identity_mismatch":
      return {
        title: "That invite is for a different contact",
        body: "The invitation was sent to another email or number. Verify the one your society used, or ask your admin to re-send it.",
      };
    case "no_invite":
      return {
        title: "Waiting on your society",
        body: "Your contact details are verified. Ask your society admin to add you, and you'll be let in as soon as they do.",
      };
    default:
      return {
        title: "You're signed in",
        body: "We couldn't find a society linked to this account yet. Verify your contact details or ask your admin for an invitation.",
      };
  }
}
