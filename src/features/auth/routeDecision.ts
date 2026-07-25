import { needsProfileCompletion } from "@/features/auth/profileCompletion";
import type { Profile, ProfileStatus } from "@/stores/session";

export const ROLE_HOME = {
  resident: "/(resident)/home",
  guard: "/(guard)/gate",
  admin: "/(admin)/dashboard",
} as const;

export interface RouteDecisionInput {
  isLoaded: boolean;
  isSignedIn: boolean;
  onboardingReady: boolean;
  onboardingDone: boolean;
  profileStatus: ProfileStatus;
  profile: Profile | null;
  /** Clerk user, consulted only to decide if profile completion is required. */
  user: Parameters<typeof needsProfileCompletion>[0];
  segments: string[];
}

/**
 * Pure routing decision: returns the path to `replace` to, or null to stay put.
 *
 * Deliberately free of expo-router and Clerk imports so it can be unit-tested
 * in plain Node. The component-level test cannot run at all on RN 0.83, which
 * dropped react-test-renderer, so the rules are covered here instead.
 */
export function resolveSessionRoute({
  isLoaded,
  isSignedIn,
  onboardingReady,
  onboardingDone,
  profileStatus,
  profile,
  user,
  segments,
}: RouteDecisionInput): string | null {
  if (!isLoaded || !onboardingReady) return null;

  const seg0 = String(segments[0] ?? "");
  const seg1 = String(segments[1] ?? "");
  const inAuth = seg0 === "(auth)";
  const atRoot = !seg0 || seg0 === "index";
  const onOnboarding = inAuth && seg1 === "onboarding";
  const onCompleteProfile = inAuth && seg1 === "complete-profile";
  const onPendingAccess = inAuth && seg1 === "pending-access";

  if (!isSignedIn && !onboardingDone && !onOnboarding) {
    return "/(auth)/onboarding";
  }
  if (!isSignedIn && onboardingDone && (!inAuth || onOnboarding || atRoot)) {
    return "/(auth)/sign-in";
  }

  // Signed in but not attached to a society. These users used to be left on
  // `/index`, which dead-ended with "ask an admin to invite your verified
  // phone or email" — including users who had simply not verified yet and
  // could have resolved it themselves. Send them somewhere actionable.
  if (
    isSignedIn &&
    (profileStatus === "pendingVerification" || profileStatus === "unlinked")
  ) {
    return onPendingAccess ? null : "/(auth)/pending-access";
  }

  if (isSignedIn && profileStatus === "linked" && profile) {
    if (needsProfileCompletion(user, profile)) {
      return onCompleteProfile ? null : "/(auth)/complete-profile";
    }
    // Verified and linked: land on the role home instead of lingering in the
    // auth group after verification.
    if (inAuth || atRoot) return ROLE_HOME[profile.role];
  }

  return null;
}
