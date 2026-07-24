import "../global.css";

import {
  hasBackendConfig,
  MissingConfigScreen,
} from "@/components/MissingConfigScreen";
import { OtaBanner } from "@/components/OtaBanner";
import { Button, Screen } from "@/components/ui";
import { getVerifiedPrimaryIdentity } from "@/features/auth/identity";
import { useSessionRestorationRouting } from "@/features/auth/sessionRouting";
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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { ActivityIndicator, Alert, Text, useColorScheme, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { z } from "zod";

const inviteClaimInputSchema = onboardingIdentitySchema.safeExtend({
  name: z.string().trim().min(1).max(120).optional(),
});
const inviteClaimResultSchema = z.union([
  z.literal(true),
  z.strictObject({ claimed: z.boolean() }).passthrough(),
]);

applyGlobalFont(); // Manrope everywhere — the starter's global font patch

initSentry(); // ties crashes to the exact EAS Update id (ticket #4)
configureNotifications().catch(() => {}); // gate channel + approve/deny actions (#7)

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 15_000 } },
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
        setProfileFailed(error.message || "Could not load your Portl profile.");
        return;
      }
      let prof = (data as Profile) ?? null;

      // Request a claim using a Clerk-verified primary identifier. This value is
      // only a hint: claim_invite must match it against verified JWT claims.
      if (!prof) {
        const identity = getVerifiedPrimaryIdentity(user);
        if (identity) {
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
          if (claimError) {
            setProfileFailed(
              claimError.message || "Could not check your society invitation.",
            );
            return;
          }
          const parsedClaim = parseInput(inviteClaimResultSchema, claim);
          if (
            parsedClaim === true ||
            parsedClaim.claimed
          ) {
            const { data: fresh, error: freshError } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", user.id)
              .maybeSingle();
            if (cancelled) return;
            if (freshError) {
              setProfileFailed(
                freshError.message || "Could not load your linked profile.",
              );
              return;
            }
            prof = (fresh as Profile) ?? null;
          }
        }
      }

      if (prof) {
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

  if (isSignedIn && profileStatus !== "linked") {
    return (
      <Screen className="items-center justify-center gap-4 p-8">
        <Text className="text-display text-ink">Portl</Text>
        {profileStatus === "loading" ? (
          <>
            <ActivityIndicator color={colors.primary} />
            <Text className="text-center text-body text-ink-soft">
              Linking your society profile…
            </Text>
          </>
        ) : null}
        {profileStatus === "unlinked" ? (
          <>
            <Text className="text-center text-title text-ink">
              No society invitation found
            </Text>
            <Text className="text-center text-body text-ink-soft">
              Ask your society admin to invite your verified phone number or
              email, then try again.
            </Text>
            <Button title="Try again" onPress={retryProfile} />
            <Button
              title="Sign out"
              variant="ghost"
              onPress={() => void signOutSafely()}
            />
          </>
        ) : null}
        {profileStatus === "failed" ? (
          <>
            <Text accessibilityRole="alert" className="text-center text-title text-ink">
              Couldn’t load your profile
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
        ) : null}
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
          <RoleGate>
            <StatusBar style={scheme === "dark" ? "light" : "dark"} backgroundColor={colors.paper} />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.paper },
              }}
            />
          </RoleGate>
        </QueryClientProvider>
      </ClerkProvider>
    </GestureHandlerRootView>
  );
}

export default wrapRoot(RootLayout);
