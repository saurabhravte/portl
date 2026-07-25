import { BrandMark } from "@/components/BrandMark";
import { Button, Field, Screen } from "@/components/ui";
import { clerkErrorMessage, isValidIdentity } from "@/features/auth/identity";
import { signOutFromPortl } from "@/lib/signOut";
import { useSupabase } from "@/lib/supabase";
import { useSessionStore } from "@/stores/session";
import { useClerk, useUser } from "@clerk/expo";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";

type Channel = "email" | "phone";

/**
 * Landing screen for a signed-in user who has no society profile yet.
 *
 * Replaces the old dead end at `/index`, which told every such user to "ask an
 * admin to invite your verified phone or email" — including users who simply
 * had not verified anything yet and could have fixed it themselves.
 *
 * Two states:
 *   pendingVerification — nothing verified, so no invite claim is possible.
 *                         Verification is deferred to here rather than being
 *                         forced during sign-up, so account creation is never
 *                         blocked. Verifying re-triggers the claim.
 *   unlinked            — identity verified, but no invite matched. Genuinely
 *                         needs an admin; we show status, not an error.
 */
export default function PendingAccess() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const supabase = useSupabase();
  const router = useRouter();
  const profileStatus = useSessionStore((s) => s.profileStatus);
  const retryProfile = useSessionStore((s) => s.retryProfile);

  const [channel, setChannel] = useState<Channel>("email");
  const [value, setValue] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const needsVerification = profileStatus === "pendingVerification";

  const sendCode = async () => {
    if (!user) return;
    if (!isValidIdentity(channel, value)) {
      Alert.alert(
        "Check that again",
        channel === "email"
          ? "Enter a valid email address."
          : "Enter your phone number in international format, e.g. +919876543210.",
      );
      return;
    }
    setBusy(true);
    try {
      if (channel === "email") {
        const created = await user.createEmailAddress({ email: value.trim() });
        await created.prepareVerification({ strategy: "email_code" });
      } else {
        const created = await user.createPhoneNumber({ phoneNumber: value.trim() });
        await created.prepareVerification();
      }
      setSent(true);
    } catch (error) {
      Alert.alert(
        "Couldn’t send the code",
        clerkErrorMessage(error, "Try again in a moment."),
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const target =
        channel === "email"
          ? user.emailAddresses.find((e) => e.emailAddress === value.trim())
          : user.phoneNumbers.find((p) => p.phoneNumber === value.trim());
      if (!target) throw new Error("That identifier is no longer on your account.");

      await target.attemptVerification({ code: code.trim() });
      await user.reload();

      // Verified now, so the root effect can attempt the invite claim.
      retryProfile();
    } catch (error) {
      Alert.alert(
        "Couldn’t verify",
        clerkErrorMessage(error, "Check the code and try again."),
      );
    } finally {
      setBusy(false);
    }
  };

  const onSignOut = async () => {
    try {
      await signOutFromPortl(supabase, signOut);
      router.replace("/(auth)/sign-in" as never);
    } catch (error) {
      Alert.alert(
        "Couldn’t sign out",
        error instanceof Error ? error.message : "Try again.",
      );
    }
  };

  return (
    <Screen keyboard centered>
      <ScrollView
        contentContainerClassName="grow justify-center gap-4 p-6"
        keyboardShouldPersistTaps="handled"
      >
        <BrandMark size="md" />

        {needsVerification ? (
          <>
            <Text accessibilityRole="header" className="text-center text-title text-ink">
              Verify your contact
            </Text>
            <Text className="text-center text-body text-ink-soft">
              Your account is ready. Verify an email or phone number so your
              society can match you to your invitation.
            </Text>

            {!sent ? (
              <>
                <View className="flex-row gap-2">
                  <Button
                    title="Email"
                    variant={channel === "email" ? "primary" : "secondary"}
                    onPress={() => setChannel("email")}
                  />
                  <Button
                    title="Phone"
                    variant={channel === "phone" ? "primary" : "secondary"}
                    onPress={() => setChannel("phone")}
                  />
                </View>
                <Field
                  label={channel === "email" ? "Email address" : "Phone number"}
                  value={value}
                  onChangeText={setValue}
                  autoCapitalize="none"
                  keyboardType={channel === "email" ? "email-address" : "phone-pad"}
                  placeholder={
                    channel === "email" ? "you@example.com" : "+91 98765 43210"
                  }
                />
                <Button
                  title="Send code"
                  onPress={() => void sendCode()}
                  loading={busy}
                />
              </>
            ) : (
              <>
                <Field
                  label="Verification code"
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  placeholder="123456"
                />
                <Button
                  title="Verify"
                  onPress={() => void confirmCode()}
                  loading={busy}
                />
                <Button
                  title="Use a different contact"
                  variant="ghost"
                  onPress={() => {
                    setSent(false);
                    setCode("");
                  }}
                  disabled={busy}
                />
              </>
            )}
          </>
        ) : (
          <>
            <Text accessibilityRole="header" className="text-center text-title text-ink">
              Waiting for your society
            </Text>
            <Text className="text-center text-body text-ink-soft">
              You’re verified, but no invitation matches your contact details
              yet. Ask your society admin to invite{" "}
              {user?.primaryEmailAddress?.emailAddress ??
                user?.primaryPhoneNumber?.phoneNumber ??
                "your contact"}
              , then check again.
            </Text>
            <Button title="Check again" onPress={retryProfile} />
          </>
        )}

        <Button
          title="Sign out"
          variant="ghost"
          onPress={() => void onSignOut()}
          disabled={busy}
        />
      </ScrollView>
    </Screen>
  );
}
