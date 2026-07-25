import { Button, Screen } from "@/components/ui";
import { ContactDetailsSection } from "@/features/auth/ContactDetailsSection";
import { AUTH } from "@/lib/copy";
import { signOutFromPortl } from "@/lib/signOut";
import { useSupabase } from "@/lib/supabase";
import { useSessionStore } from "@/stores/session";
import { useClerk } from "@clerk/expo";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";

/**
 * Lobby for a signed-in user who is not attached to a society yet.
 * Verification is optional and user-initiated — never forced open.
 */
export default function PendingAccess() {
  const { signOut } = useClerk();
  const supabase = useSupabase();
  const router = useRouter();
  const profileStatus = useSessionStore((s) => s.profileStatus);
  const retryProfile = useSessionStore((s) => s.retryProfile);
  const [showVerify, setShowVerify] = useState(false);

  const needsVerification = profileStatus === "pendingVerification";

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

  const onVerifyLater = () => {
    Alert.alert(
      AUTH.verifyLater,
      "You can verify anytime from Profile after you sign back in. Without a verified contact your society can't match an invite yet.",
      [
        { text: "Stay here", style: "cancel" },
        {
          text: AUTH.signOut,
          style: "destructive",
          onPress: () => void onSignOut(),
        },
      ],
    );
  };

  return (
    <Screen keyboard centered>
      <ScrollView
        contentContainerClassName="grow justify-center gap-6 p-6"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-2">
          <Text accessibilityRole="header" className="text-display text-ink">
            {needsVerification ? AUTH.pendingVerifyTitle : AUTH.noSocietyTitle}
          </Text>
          <Text className="text-body text-ink-muted">
            {needsVerification ? AUTH.pendingVerifyBody : AUTH.noSocietyBody}
          </Text>
        </View>

        {needsVerification ? (
          showVerify ? (
            <ContactDetailsSection emphasis="onboarding" startOpen />
          ) : (
            <View className="gap-3">
              <Button title={AUTH.verifyNow} onPress={() => setShowVerify(true)} />
              <Button
                title={AUTH.verifyLater}
                variant="secondary"
                onPress={onVerifyLater}
              />
            </View>
          )
        ) : (
          <View className="gap-3">
            <View className="rounded-xl border border-deny bg-deny-bg px-3 py-3">
              <Text className="text-label text-deny-text">
                No society profile linked
              </Text>
              <Text className="mt-1 text-caption text-ink-soft">
                Ask your admin to invite your verified email or phone, then tap
                Check again.
              </Text>
            </View>
            <Button title={AUTH.checkAgain} onPress={retryProfile} />
          </View>
        )}

        <Button
          title={AUTH.signOut}
          variant="ghost"
          onPress={() => void onSignOut()}
        />
      </ScrollView>
    </Screen>
  );
}
