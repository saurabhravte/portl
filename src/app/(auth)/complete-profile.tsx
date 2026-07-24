import { BrandMark } from "@/components/BrandMark";
import { Button, Field, Screen } from "@/components/ui";
import { clerkErrorMessage } from "@/features/auth/identity";
import { useSupabase } from "@/lib/supabase";
import { useZodForm } from "@/lib/useZodForm";
import { profileCompletionSchema } from "@/lib/validation";
import { signOutFromPortl } from "@/lib/signOut";
import { useSessionStore } from "@/stores/session";
import { useClerk, useUser } from "@clerk/expo";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
} from "react-native";

/**
 * Shown after Google sign-in when username and/or contact phone are missing.
 * Blocks entry to role homes until the form is completed.
 */
export default function CompleteProfile() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const supabase = useSupabase();
  const router = useRouter();
  const profile = useSessionStore((s) => s.profile);
  const setLinkedProfile = useSessionStore((s) => s.setLinkedProfile);
  const form = useZodForm(profileCompletionSchema, {
    username: user?.username ?? "",
    phone: profile?.phone ?? "",
  });
  const [busy, setBusy] = useState(false);
  const onSubmit = () => {
    form.submit((data) => {
      void (async () => {
        if (!user || !profile) return;
        setBusy(true);
        try {
          if (user.username !== data.username) {
            await user.update({ username: data.username });
          }
          await user.update({
            unsafeMetadata: {
              ...(user.unsafeMetadata ?? {}),
              contactPhone: data.phone,
            },
          });

          const { data: updated, error } = await supabase.rpc(
            "update_my_profile",
            {
              p_name: data.username,
              p_phone: data.phone,
            },
          );
          if (error) throw error;

          const nextName =
            updated &&
            typeof updated === "object" &&
            "name" in updated &&
            typeof (updated as { name?: unknown }).name === "string"
              ? (updated as { name: string }).name
              : data.username;
          const nextPhone =
            updated &&
            typeof updated === "object" &&
            "phone" in updated &&
            typeof (updated as { phone?: unknown }).phone === "string"
              ? (updated as { phone: string }).phone
              : data.phone;

          setLinkedProfile({
            ...profile,
            name: nextName,
            phone: nextPhone,
          });
          router.replace("/");
        } catch (error) {
          Alert.alert(
            "Could not save profile",
            clerkErrorMessage(
              error,
              "Check your username and phone, then try again. Enable Username in Clerk if updates fail.",
            ),
          );
        } finally {
          setBusy(false);
        }
      })();
    });
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
    <Screen>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerClassName="grow justify-center gap-4 p-6"
          keyboardShouldPersistTaps="handled"
        >
          <BrandMark size="md" />
          <Text className="text-center text-title text-ink">
            Complete your profile
          </Text>
          <Text className="text-center text-body text-ink-soft">
            Google signed you in — add a Portl username and contact phone before
            continuing. Phone is for society contact only, not sign-in.
          </Text>
          <Field
            label="Username"
            value={form.values.username}
            onChangeText={form.setField("username")}
            onBlur={form.blur("username")}
            error={form.errors.username}
            autoCapitalize="none"
            autoComplete="username"
            textContentType="username"
            placeholder="yourname"
          />
          <Field
            label="Phone number"
            value={form.values.phone}
            onChangeText={form.setField("phone")}
            onBlur={form.blur("phone")}
            error={form.errors.phone}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            placeholder="+91 98765 43210"
          />
          <Button title="Continue" onPress={onSubmit} loading={busy} />
          <Button
            title="Sign out"
            variant="ghost"
            onPress={() => void onSignOut()}
            disabled={busy}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
