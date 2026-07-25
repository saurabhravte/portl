import { resolveSessionRoute } from "@/features/auth/routeDecision";
import type { Profile, ProfileStatus } from "@/stores/session";
import { useAuth, useUser } from "@clerk/expo";
import { useRouter, useSegments } from "expo-router";
import { useEffect } from "react";

export { ROLE_HOME, resolveSessionRoute } from "@/features/auth/routeDecision";

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
    const target = resolveSessionRoute({
      isLoaded,
      isSignedIn: !!isSignedIn,
      onboardingReady,
      onboardingDone,
      profileStatus,
      profile,
      user,
      segments: segments as string[],
    });
    if (target) router.replace(target as never);
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
