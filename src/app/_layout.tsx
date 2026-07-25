import "../global.css";

import {
  hasBackendConfig,
  MissingConfigScreen,
} from "@/components/MissingConfigScreen";
import { OtaBanner } from "@/components/OtaBanner";
import { Button, Screen } from "@/components/ui";
import { getVerifiedPrimaryIdentity } from "@/features/auth/identity";
import {
  parseClaimResult,
  reasonFromLegacyError,
} from "@/features/auth/inviteClaim";
import { useSessionRestorationRouting } from "@/features/auth/sessionRouting";
import {
  getContactPhoneFromMetadata,
} from "@/features/auth/profileCompletion";
import {
  heartbeatGuardDeviceSession,
  registerGuardDeviceSession,
} from "@/lib/guardDevice";
import {
  configureNotifications,
  addExpoPushTokenRolloverListener,
  handleLastVisitorNotificationResponse,
  handleVisitorNotificationResponse,
  registerPushToken,
  getTrackedDevicePushToken,
} from "@/lib/notifications";
import {
  clearGateQueueForSessionChange,
  useGateQueueAutoFlush,
  useGateQueueScope,
} from "@/lib/offline";
import { useOnboardingStore } from "@/lib/onboarding";
import { initSentry, wrapRoot } from "@/lib/sentry";
import { useSupabase } from "@/lib/supabase";
import { signOutFromPortl } from "@/lib/signOut";
import { tokenCache } from "@/lib/tokenCache";
import { onboardingIdentitySchema, parseInput } from "@/lib/validation";
import { useSessionStore, type Profile } from "@/stores/session";
import { applyGlobalFont } from "@/theme/applyGlobalFont";
import { manropeFontMap } from "@/theme/fonts";
import { useThemeColors } from "@/theme/useThemeColors";
import { useThemeStore } from "@/stores/theme";
import { ClerkProvider, useAuth, useClerk, useUser } from "@clerk/expo";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { Toaster } from "@/components/Toaster";
import { classifyError } from "@/lib/errors";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import React, { useEffect } from "react";
import { ActivityIndicator, Alert, Text, useColorScheme, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { z } from "zod";

const inviteClaimInputSchema = onboardingIdentitySchema.safeExtend({
  name: z.string().trim().min(1).max(120).optional(),
});

applyGlobalFont(); // Manrope everywhere — the starter's global font patch

initSentry(); // ties crashes to the exact EAS Update id (ticket #4)
configureNotifications().catch(() => {}); // gate channel + approve/deny actions (#7)

SplashScreen.preventAutoHideAsync();

// Let React Query pause/resume with connectivity — powers offline + the
// automatic refetch when the phone comes back online (#4, #5).
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(state.isConnected !== false && state.isInternetReachable !== false);
  }),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnReconnect: true,
      // Never retry auth/permission/not-found — retrying can't fix them and
      // just delays the correct state. Retry transient/network errors twice.
      retry: (failureCount, error) => {
        const kind = classifyError(error).kind;
        if (kind === "session" || kind === "permission" || kind === "notFound") {
          return false;
        }
        return failureCount < 2;
      },
    },
  },
});

/** Loads the Supabase profile for the Clerk user and routes by role. */
function RoleGate({ children }: { children: React.ReactNode }) {
  const colors = useThemeColors();
  const { isSignedIn, isLoaded } = useAuth();
  const { signOut } = useClerk();
  const { user } = useUser();
  const supabase = useSupabase();
  const {
    profile,
    profileStatus,
    profileError,
    profileRetryKey,
    setProfileLoading,
    setLinkedProfile,
    setProfileUnlinked,
    setProfilePendingVerification,
    setProfileFailed,
    resetProfile,
    retryProfile,
  } = useSessionStore();
  const router = useRouter();
  const onboardingReady = useOnboardingStore((s) => s.ready);
  const onboardingDone = useOnboardingStore((s) => s.completed);
  const hydrateOnboarding = useOnboardingStore((s) => s.hydrate);
  useSessionRestorationRouting({
    onboardingReady,
    onboardingDone,
    profileStatus,
    profile,
  });
  useGateQueueScope(
    profile ? { userId: profile.id, societyId: profile.society_id } : null,
  );
  useGateQueueAutoFlush(supabase);

  useEffect(() => {
    void hydrateOnboarding();
  }, [hydrateOnboarding]);

  useEffect(() => {
  }, [isLoaded, isSignedIn, user?.id, profile?.role, profileStatus]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !user) {
      clearGateQueueForSessionChange();
      resetProfile();
      return;
    }
    let cancelled = false;

    (async () => {
      setProfileLoading();
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        // Raw PostgREST/Postgres strings are not user-facing copy. The real
        // message still goes to Sentry via the query client.
        setProfileFailed(
          "We couldn't reach Portl just now. Check your connection and try again.",
        );
        return;
      }
      let prof = (data as Profile) ?? null;

      // Request a claim using a Clerk-verified primary identifier. This value is
      // only a hint: claim_invite must match it against verified JWT claims.
      //
      // Verification stays MANDATORY here on purpose. Relaxing it would let a
      // user claim an invite addressed to an email or phone they do not own.
      // What changed is the failure mode: an unverified user is now a
      // recoverable `pendingVerification` state routed to a screen that lets
      // them verify, rather than a dead end demanding an admin invite.
      if (!prof) {
        const identity = getVerifiedPrimaryIdentity(user);

        // No verified identifier yet. This is the ordinary state right after a
        // username-only sign-up, so it must NOT read as a failure — the user
        // goes to the in-app lobby where verification lives (Phase 2).
        if (!identity) {
          setProfilePendingVerification();
          return;
        }

        const claimInput = parseInput(inviteClaimInputSchema, {
          identityType: identity.type,
          identityValue: identity.value,
          name: user.fullName ?? undefined,
        });
        const { data: claim, error: claimError } = await supabase.rpc(
          "claim_invite",
          {
            p_identity_type: claimInput.identityType,
            p_identity_value: claimInput.identityValue,
            p_name: claimInput.name,
          },
        );
        if (cancelled) return;

        // A claim that finds nothing is a normal outcome, not a fault. Only a
        // genuinely unexpected RPC failure (network, ambiguous invite, RLS)
        // may reach `setProfileFailed`, which is the terminal error screen.
        let result = claimError
          ? reasonFromLegacyError(claimError)
          : parseClaimResult(claim);

        if (!result) {
          setProfileFailed(
            "We couldn't check your society invitation. Please try again.",
          );
          return;
        }

        if (result.reason === "identity_unverified") {
          setProfilePendingVerification();
          return;
        }

        // `claimed` or `already_linked` both mean a row should now exist.
        if (result.claimed || result.reason === "already_linked") {
          const { data: fresh, error: freshError } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .maybeSingle();
          if (cancelled) return;
          if (freshError) {
            setProfileFailed(
              "We couldn't load your profile. Please try again.",
            );
            return;
          }
          prof = (fresh as Profile) ?? null;
        }
      }

      if (prof) {
        const contactPhone = getContactPhoneFromMetadata(user);
        const preferredName = user.username?.trim() || undefined;
        if (contactPhone || preferredName) {
          const { data: patched, error: patchError } = await supabase.rpc(
            "update_my_profile",
            {
              p_name: preferredName,
              p_phone: contactPhone ?? undefined,
            },
          );
          if (!cancelled && !patchError && patched && typeof patched === "object") {
            const patch = patched as {
              name?: string;
              phone?: string | null;
            };
            prof = {
              ...prof,
              name: typeof patch.name === "string" ? patch.name : prof.name,
              phone:
                patch.phone !== undefined ? patch.phone : prof.phone,
            };
          }
        }
        setLinkedProfile(prof);
        registerPushToken(supabase, user.id).catch(() => {});
      } else {
        setProfileUnlinked();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isLoaded,
    isSignedIn,
    user,
    profileRetryKey,
    supabase,
    resetProfile,
    setLinkedProfile,
    setProfileFailed,
    setProfileLoading,
    setProfileUnlinked,
    setProfilePendingVerification,
  ]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) =>
        void handleVisitorNotificationResponse(
          supabase,
          response,
          (url) => router.push(url as any),
        ),
    );
    return () => sub.remove();
  }, [router, supabase]);

  useEffect(() => {
    if (!isSignedIn || profileStatus !== "linked" || !profile) return;
    void handleLastVisitorNotificationResponse(
      supabase,
      (url) => router.push(url as any),
    );
  }, [isSignedIn, profile, profileStatus, router, supabase]);

  useEffect(() => {
    if (!isSignedIn || profileStatus !== "linked" || !profile) return;
    const subscription = addExpoPushTokenRolloverListener(supabase, profile.id);
    return () => subscription.remove();
  }, [isSignedIn, profile, profileStatus, supabase]);

  useEffect(() => {
    if (
      !isSignedIn ||
      profileStatus !== "linked" ||
      profile?.role !== "guard"
    ) {
      return;
    }
    let active = true;
    const heartbeat = async () => {
      try {
        await registerGuardDeviceSession(
          supabase,
          getTrackedDevicePushToken(),
        );
        if (active) await heartbeatGuardDeviceSession(supabase);
      } catch {
        // Gate RPCs remain server-blocked until a healthy heartbeat succeeds.
      }
    };
    void heartbeat();
    const timer = setInterval(() => void heartbeat(), 2 * 60_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isSignedIn, profile?.role, profileStatus, supabase]);

  const signOutSafely = async () => {
    try {
      await signOutFromPortl(supabase, signOut);
    } catch (error) {
      Alert.alert(
        "Couldn’t sign out",
        error instanceof Error ? error.message : "Check your connection and try again.",
      );
    }
  };

  /**
   * Phase 1.5 — only two states may block the router.
   *
   * This used to be `profileStatus !== "linked"`, which swallowed
   * `pendingVerification` and `unlinked` too. Both of those are states
   * `resolveSessionRoute()` explicitly routes to `/(auth)/pending-access`,
   * but that screen could never mount: the gate returned before `children`
   * (the <Stack>) rendered, so the navigation landed in an unmounted tree and
   * the user was left staring at this screen with no way forward.
   *
   * `pendingVerification` did not even have a branch here, so it rendered a
   * bare "Portl" wordmark on an empty screen.
   *
   * Recoverable states now fall through to the router and get a real,
   * actionable screen. Only "still working" and "genuinely broken" block.
   */
  const blocksRouter =
    isSignedIn && (profileStatus === "loading" || profileStatus === "failed");

  if (blocksRouter) {
    return (
      <Screen className="items-center justify-center gap-4 p-8">
        <Text className="text-display text-ink">Portl</Text>
        {profileStatus === "loading" ? (
          <>
            <ActivityIndicator color={colors.primary} />
            <Text className="text-center text-body text-ink-soft">
              Getting things ready…
            </Text>
          </>
        ) : (
          <>
            <Text
              accessibilityRole="alert"
              className="text-center text-title text-ink"
            >
              Something went wrong
            </Text>
            <Text className="text-center text-body text-ink-soft">
              {profileError ?? "Check your connection and try again."}
            </Text>
            <Button title="Try again" onPress={retryProfile} />
            <Button
              title="Sign out"
              variant="ghost"
              onPress={() => void signOutSafely()}
            />
          </>
        )}
      </Screen>
    );
  }

  if (!onboardingReady) {
    return (
      <Screen className="items-center justify-center gap-4 p-8">
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }

  return (
    <View className="flex-1">
      <OtaBanner />
      {children}
    </View>
  );
}

function RootLayout() {
  const [loaded, error] = useFonts(manropeFontMap);
  const colors = useThemeColors();
  const scheme = useColorScheme();
  const hydrateTheme = useThemeStore((s) => s.hydrate);

  useEffect(() => {
    void hydrateTheme();
  }, [hydrateTheme]);

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  // Paint the native root view to match the scheme. Without this the window
  // behind the React tree stays white, which flashes on cold start and during
  // stack transitions in dark mode.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.paper).catch(() => {});
  }, [colors.paper]);

  if (!loaded && !error) return null;


  if (!hasBackendConfig()) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} backgroundColor={colors.paper} />
        <MissingConfigScreen />
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ClerkProvider
        publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
        tokenCache={tokenCache}
      >
        <QueryClientProvider client={queryClient}>
          <ConnectionBanner />
          <RoleGate>
            <StatusBar style={scheme === "dark" ? "light" : "dark"} backgroundColor={colors.paper} />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.paper },
              }}
            />
          </RoleGate>
          <Toaster />
        </QueryClientProvider>
      </ClerkProvider>
    </GestureHandlerRootView>
  );
}

export default wrapRoot(RootLayout);
