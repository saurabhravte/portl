import { Button, Screen } from "@/components/ui";
import { ContactDetailsSection } from "@/features/auth/ContactDetailsSection";
import { claimReasonCopy } from "@/features/auth/inviteClaim";
import { signOutFromPortl } from "@/lib/signOut";
import { useSupabase } from "@/lib/supabase";
import { useSessionStore } from "@/stores/session";
import { useClerk } from "@clerk/expo";
import { useRouter } from "expo-router";
import React from "react";
import { Alert, ScrollView, Text, View } from "react-native";

/**
 * Lobby for a signed-in user who is not attached to a society yet.
 *
 * WHY THIS SCREEN CAN NOW ACTUALLY BE SEEN
 *   `resolveSessionRoute()` has always routed `pendingVerification` and
 *   `unlinked` here, but `RoleGate` returned a blocking screen for any status
 *   other than "linked" — before `children` (the <Stack>) rendered. The
 *   navigation resolved into an unmounted tree, so this screen never
 *   appeared and the user was stuck on "Couldn't load your profile". The gate
 *   now only blocks on `loading` and `failed`. See src/app/_layout.tsx.
 *
 * WHY IT IS NOT A DEAD END
 *   `profiles.society_id` is NOT NULL, so a user with no society genuinely
 *   cannot have a profile row and cannot be shown the resident home. What we
 *   can guarantee is that they are never stranded: this screen states the
 *   situation in plain language and gives them the one action that resolves
 *   it, using the same ContactDetailsSection that lives in Profile.
 */
export default function PendingAccess() {
  const { signOut } = useClerk();
  const supabase = useSupabase();
  const router = useRouter();
  const profileStatus = useSessionStore((s) => s.profileStatus);
  const retryProfile = useSessionStore((s) => s.retryProfile);

  const needsVerification = profileStatus === "pendingVerification";
  const copy = claimReasonCopy(
    needsVerification ? "identity_unverified" : "no_invite",
  );

  const onSignOut = async () => {
    try {
      await signOutFromPortl(supabase, signOut);
      router.replace("/(auth)/sign-in" as never);
    } catch (error) {
      Alert.alert(
        "Couldn't sign out",
        error instanceof Error ? error.message : "Try again.",
      );
    }
  };

  return (
    <Screen keyboard centered>
      <ScrollView
        contentContainerClassName="grow justify-center gap-6 p-6"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-2">
          <Text accessibilityRole="header" className="text-display text-ink">
            {copy.title}
          </Text>
          <Text className="text-body text-ink-muted">{copy.body}</Text>
        </View>

        {needsVerification ? (
          <ContactDetailsSection emphasis="onboarding" />
        ) : (
          <View className="gap-3">
            <View className="rounded-md border border-deny bg-deny-bg px-3 py-3">
              <Text className="text-label text-deny-text">
                No society profile linked
              </Text>
              <Text className="mt-1 text-caption text-ink-soft">
                Your Clerk account is signed in, but it is not mapped in{" "}
                <Text className="text-ink">demo_seed.sql</Text>. Wrong subject
                IDs look like an empty app — not an auth error. Re-run seed with
                your Clerk <Text className="text-ink">user_…</Text> subjects, then
                tap Check again.
              </Text>
            </View>
            <Button title="Check again" onPress={retryProfile} />
          </View>
        )}

        <Button
          title="Sign out"
          variant="ghost"
          onPress={() => void onSignOut()}
        />
      </ScrollView>
    </Screen>
  );
}
