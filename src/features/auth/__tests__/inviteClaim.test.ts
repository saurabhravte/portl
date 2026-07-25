import {
  claimReasonCopy,
  parseClaimResult,
  reasonFromLegacyError,
} from "../inviteClaim";

/**
 * These cover the exact payloads that produced the reported failure:
 * "Couldn't load your profile / a verified E.164 phone number or email claim
 * is required". Before migration 0038 that arrived as a thrown Postgres
 * exception; after it, as a soft result. Both must classify the same way, so
 * an old client against a new database (or the reverse, mid-rollout) never
 * regresses to the dead-end screen.
 */
describe("parseClaimResult", () => {
  it("reads the 0038 success payload", () => {
    expect(
      parseClaimResult({
        claimed: true,
        reason: "claimed",
        society_id: "abc",
        role: "resident",
      }),
    ).toEqual({ claimed: true, reason: "claimed" });
  });

  it.each([
    "identity_unverified",
    "identity_mismatch",
    "no_invite",
    "already_linked",
  ] as const)("reads the %s soft result", (reason) => {
    expect(parseClaimResult({ claimed: false, reason })).toEqual({
      claimed: false,
      reason,
    });
  });

  it("accepts the legacy `true` shape", () => {
    expect(parseClaimResult(true)).toEqual({ claimed: true, reason: "claimed" });
  });

  it("accepts the legacy {claimed} shape with no reason", () => {
    expect(parseClaimResult({ claimed: true })).toEqual({
      claimed: true,
      reason: "claimed",
    });
    expect(parseClaimResult({ claimed: false })).toEqual({
      claimed: false,
      reason: "unknown",
    });
  });

  it("does not throw on an unknown reason from a newer database", () => {
    expect(
      parseClaimResult({ claimed: false, reason: "society_suspended" }),
    ).toEqual({ claimed: false, reason: "unknown" });
  });

  it.each([null, undefined, 42, "nope", []])(
    "degrades safely on garbage: %p",
    (input) => {
      expect(parseClaimResult(input)).toEqual({
        claimed: false,
        reason: "unknown",
      });
    },
  );
});

describe("reasonFromLegacyError", () => {
  it("classifies the reported E.164 exception", () => {
    expect(
      reasonFromLegacyError({
        message: "a verified E.164 phone number or email claim is required",
        code: "28000",
      }),
    ).toEqual({ claimed: false, reason: "identity_unverified" });
  });

  it("classifies it from the message alone when the errcode is stripped", () => {
    expect(
      reasonFromLegacyError({
        message: "a verified phone number or email claim is required",
      }),
    ).toEqual({ claimed: false, reason: "identity_unverified" });
  });

  it("treats an existing profile as already linked, not a failure", () => {
    expect(reasonFromLegacyError({ message: "profile already exists" })).toEqual(
      { claimed: false, reason: "already_linked" },
    );
  });

  it("classifies an identity mismatch", () => {
    expect(
      reasonFromLegacyError({
        message: "invite identity does not match verified phone",
      }),
    ).toEqual({ claimed: false, reason: "identity_mismatch" });
  });

  it("returns null for a genuinely unexpected error so it can surface", () => {
    expect(
      reasonFromLegacyError({ message: "could not connect to server" }),
    ).toBeNull();
    expect(
      reasonFromLegacyError({
        message: "multiple active invitations exist for this identity",
      }),
    ).toBeNull();
  });
});

describe("claimReasonCopy", () => {
  it("never leaks a raw database string", () => {
    for (const reason of [
      "identity_unverified",
      "identity_mismatch",
      "no_invite",
      "unknown",
    ] as const) {
      const { title, body } = claimReasonCopy(reason);
      expect(title).not.toMatch(/E\.164|errcode|claim_invite|exception/i);
      expect(body).not.toMatch(/E\.164|errcode|claim_invite|exception/i);
      expect(title.length).toBeGreaterThan(0);
      expect(body.length).toBeGreaterThan(0);
    }
  });
});
