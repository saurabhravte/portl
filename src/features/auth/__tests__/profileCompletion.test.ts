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

  it("flags incomplete Google profiles", () => {
    expect(
      needsProfileCompletion(
        {
          username: "ada",
          externalAccounts: [{ provider: "google" }],
        },
        { ...profile, phone: null },
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
    expect(
      needsProfileCompletion(
        { username: null, externalAccounts: [] },
        { ...profile, phone: null },
      ),
    ).toBe(false);
  });
});
