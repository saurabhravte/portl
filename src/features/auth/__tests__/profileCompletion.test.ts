import {
  hasUsableUsername,
  isGoogleAuthUser,
  needsProfileCompletion,
} from "../profileCompletion";

describe("profileCompletion", () => {
  const profile = {
    id: "u1",
    society_id: "s1",
    role: "resident" as const,
    flat_id: null,
    name: "Ada",
    phone: "+919876543210",
    expo_push_token: null,
  };

  it("detects Google auth users", () => {
    expect(
      isGoogleAuthUser({
        externalAccounts: [
          { provider: "google", verification: { status: "verified" } },
        ],
      }),
    ).toBe(true);
    expect(isGoogleAuthUser({ externalAccounts: [] })).toBe(false);
  });

  it("requires a Portl username handle for Google users", () => {
    expect(
      hasUsableUsername(
        {
          username: null,
          externalAccounts: [{ provider: "google" }],
        },
        profile,
      ),
    ).toBe(false);
    expect(
      hasUsableUsername(
        {
          username: "ada",
          externalAccounts: [{ provider: "google" }],
        },
        profile,
      ),
    ).toBe(true);
  });

  /*
   * Phase 2.2 — a missing phone no longer forces profile completion.
   *
   * This previously asserted that a Google user with no phone must be sent
   * to /(auth)/complete-profile before entering the app. Phone is society
   * contact information, not an auth factor, and it now lives in
   * Profile -> Contact details. The username requirement stays: it is the
   * handle shown in the directory, on notices and in approvals, and Google
   * supplies a full name but never a handle.
   */
  it("does not block entry on a missing phone number", () => {
    expect(
      needsProfileCompletion(
        {
          username: "ada",
          externalAccounts: [{ provider: "google" }],
        },
        { ...profile, phone: null },
      ),
    ).toBe(false);
  });

  it("still requires a username from Google users", () => {
    expect(
      needsProfileCompletion(
        { username: null, externalAccounts: [{ provider: "google" }] },
        { ...profile, name: "New member" },
      ),
    ).toBe(true);
    expect(
      needsProfileCompletion(
        {
          username: "ada",
          externalAccounts: [{ provider: "google" }],
        },
        profile,
      ),
    ).toBe(false);
  });

  it("never blocks a password user", () => {
    expect(
      needsProfileCompletion(
        { username: null, externalAccounts: [] },
        { ...profile, phone: null },
      ),
    ).toBe(false);
  });
});
