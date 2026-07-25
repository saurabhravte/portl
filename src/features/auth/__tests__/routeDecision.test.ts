import { resolveSessionRoute } from "../routeDecision";
import type { Profile, ProfileStatus } from "@/stores/session";

const profile = (role: Profile["role"] = "resident"): Profile => ({
  id: "user_1",
  society_id: "soc_1",
  role,
  flat_id: "flat_1",
  name: "Asha Menon",
  phone: "+919876543210",
  expo_push_token: null,
});

/** Email/password user — not Google, so profile completion is never required. */
const emailUser = { externalAccounts: [] };

function decide(over: Partial<Parameters<typeof resolveSessionRoute>[0]> = {}) {
  return resolveSessionRoute({
    isLoaded: true,
    isSignedIn: true,
    onboardingReady: true,
    onboardingDone: true,
    profileStatus: "linked" as ProfileStatus,
    profile: profile(),
    user: emailUser,
    segments: [],
    ...over,
  });
}

describe("resolveSessionRoute", () => {
  it("waits until Clerk and onboarding have both restored", () => {
    expect(decide({ isLoaded: false })).toBeNull();
    expect(decide({ onboardingReady: false })).toBeNull();
  });

  describe("signed out", () => {
    it("sends a first-run user to onboarding", () => {
      expect(
        decide({ isSignedIn: false, onboardingDone: false, profile: null }),
      ).toBe("/(auth)/onboarding");
    });

    it("does not bounce a user already on onboarding", () => {
      expect(
        decide({
          isSignedIn: false,
          onboardingDone: false,
          profile: null,
          segments: ["(auth)", "onboarding"],
        }),
      ).toBeNull();
    });

    it("sends a returning user to sign-in", () => {
      expect(decide({ isSignedIn: false, profile: null })).toBe(
        "/(auth)/sign-in",
      );
    });

    it("leaves them alone on other auth screens", () => {
      expect(
        decide({
          isSignedIn: false,
          profile: null,
          segments: ["(auth)", "forgot-password"],
        }),
      ).toBeNull();
    });
  });

  /**
   * Regression coverage for the reported bug: after verification the app
   * showed "couldn't load profile" and demanded a verified E.164 phone or
   * email instead of routing onward.
   */
  describe("signed in without a society link", () => {
    it.each(["pendingVerification", "unlinked"] as const)(
      "routes %s to pending-access instead of dead-ending at root",
      (status) => {
        expect(decide({ profileStatus: status, profile: null })).toBe(
          "/(auth)/pending-access",
        );
      },
    );

    it("does not loop once the user is on pending-access", () => {
      expect(
        decide({
          profileStatus: "pendingVerification",
          profile: null,
          segments: ["(auth)", "pending-access"],
        }),
      ).toBeNull();
    });

    it("never leaves an unverified user stranded at the root screen", () => {
      const target = decide({
        profileStatus: "pendingVerification",
        profile: null,
        segments: ["index"],
      });
      expect(target).not.toBeNull();
      expect(target).toBe("/(auth)/pending-access");
    });
  });

  describe("signed in and linked", () => {
    it.each([
      ["resident", "/(resident)/home"],
      ["guard", "/(guard)/gate"],
      ["admin", "/(admin)/dashboard"],
    ] as const)("routes a verified %s to their home", (role, expected) => {
      expect(decide({ profile: profile(role), segments: ["index"] })).toBe(
        expected,
      );
    });

    it("moves a linked user off the auth group after verification", () => {
      expect(decide({ segments: ["(auth)", "sign-in"] })).toBe(
        "/(resident)/home",
      );
    });

    it("stays put once inside the role group", () => {
      expect(decide({ segments: ["(resident)", "payments"] })).toBeNull();
    });

    it("sends a Google user missing a username to complete-profile", () => {
      const googleUser = {
        externalAccounts: [{ provider: "google", verification: { status: "verified" } }],
        username: null,
      };
      expect(
        decide({ user: googleUser, profile: { ...profile(), name: "user" } }),
      ).toBe("/(auth)/complete-profile");
    });

    it("does not loop on complete-profile", () => {
      const googleUser = {
        externalAccounts: [{ provider: "google", verification: { status: "verified" } }],
        username: null,
      };
      expect(
        decide({
          user: googleUser,
          profile: { ...profile(), name: "user" },
          segments: ["(auth)", "complete-profile"],
        }),
      ).toBeNull();
    });
  });

  it("holds position while the profile is still loading", () => {
    expect(decide({ profileStatus: "loading", profile: null })).toBeNull();
  });

  it("holds position on a fetch failure so the retry UI can render", () => {
    expect(decide({ profileStatus: "failed", profile: null })).toBeNull();
  });
});
