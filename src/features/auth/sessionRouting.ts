import {
  needsProfileCompletion,
} from "@/features/auth/profileCompletion";
import type { Profile, ProfileStatus } from "@/stores/session";
import { useAuth, useUser } from "@clerk/expo";
import { useRouter, useSegments } from "expo-router";
import { useEffect } from "react";

export const ROLE_HOME = {
  resident: "/(resident)/home",
  guard: "/(guard)/gate",
  admin: "/(admin)/dashboard",
} as const;

/** Routes only after Clerk, onboarding, and the linked profile are restored. */
export function useSessionRestorationRouting({
  onboardingReady,
  onboardingDone,
  profileStatus,
  profile,
}: {
  onboardingReady: boolean;
  onboardingDone: boolean;
  profileStatus: ProfileStatus;
  profile: Profile | null;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded || !onboardingReady) return;
    const seg0 = String((segments as string[])[0] ?? "");
    const seg1 = String((segments as string[])[1] ?? "");
    const inAuth = seg0 === "(auth)";
    const atRoot = !seg0 || seg0 === "index";
    const onOnboarding = inAuth && seg1 === "onboarding";
    const onCompleteProfile = inAuth && seg1 === "complete-profile";

    if (!isSignedIn && !onboardingDone && !onOnboarding) {
      router.replace("/(auth)/onboarding" as never);
      return;
    }
    if (!isSignedIn && onboardingDone && (!inAuth || onOnboarding || atRoot)) {
      router.replace("/(auth)/sign-in" as never);
      return;
    }
    if (isSignedIn && profileStatus === "linked" && profile) {
      if (needsProfileCompletion(user, profile)) {
        if (!onCompleteProfile) {
          router.replace("/(auth)/complete-profile" as never);
        }
        return;
      }
      if (inAuth || atRoot) router.replace(ROLE_HOME[profile.role] as never);
    }
  }, [
    isLoaded,
    isSignedIn,
    onboardingReady,
    onboardingDone,
    profileStatus,
    profile,
    user,
    segments,
    router,
  ]);
}
