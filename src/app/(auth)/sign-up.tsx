import { Button, Field, Screen } from "@/components/ui";
import { AuthFooterLegal, AuthOrDivider } from "@/features/auth/AuthChrome";
import {
  GoogleSignInButton,
  GoogleSignInExpoGoHint,
} from "@/features/auth/GoogleSignInButton";
import { PasswordStrengthHints } from "@/features/auth/PasswordStrengthHints";
import { clerkErrorMessage } from "@/features/auth/identity";
import { useZodForm } from "@/lib/useZodForm";
import { signUpFormSchema } from "@/lib/validation";
import { useSignUp } from "@clerk/expo";
import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

/**
 * Register — Phases 2.1 to 2.5 and 6.2.
 *
 * WHAT CHANGED
 *   The form collected username, email, password AND phone, then pushed the
 *   user into a mandatory 6-digit email verification stage before the account
 *   could be used. Four fields and an inbox round-trip stood between "I want
 *   to try this" and "I am in".
 *
 *   It is now username + password. Nothing else. Email and phone are captured
 *   in Profile -> Contact details once the user is inside, where they are
 *   editable and where verification actually earns its keep: it is what
 *   matches you to your society's invitation.
 *
 * THE VERIFICATION STAGE IS GONE FROM THIS SCREEN ENTIRELY.
 *   There is no email to verify at sign-up any more, so the whole verify /
 *   resend / skip / start-over state machine went with it. That removes the
 *   "Sign-up is not complete yet" and "cannot finalize without a created
 *   session" failure modes, which were the two most common ways this screen
 *   dead-ended.
 *
 * REQUIRES A CLERK DASHBOARD SETTING
 *   Username must be enabled as an identifier and Email must be Optional, not
 *   Required, under User & authentication. If email is Required, Clerk rejects
 *   a username-only sign_up at finalize() no matter what the client sends —
 *   so that specific failure is detected and explained rather than surfaced
 *   as a raw Clerk error.
 */
export default function SignUp() {
  const { signUp } = useSignUp();
  const router = useRouter();
  const form = useZodForm(signUpFormSchema, { username: "", password: "" });
  const [busy, setBusy] = useState(false);

  const onCreate = () => {
    form.submit((data) => {
      void (async () => {
        if (!signUp) return;
        setBusy(true);
        try {
          const { error } = await signUp.password({
            username: data.username,
            password: data.password,
          });
          if (error) throw error;

          // No verification step: the account is usable immediately.
          const { error: finalizeError } = await signUp.finalize();
          if (finalizeError) throw finalizeError;

          router.replace("/");
        } catch (error) {
          const message = clerkErrorMessage(error, "");
          const lower = message.toLowerCase();

          // The one failure the client cannot fix by itself.
          const needsEmail =
            lower.includes("email") &&
            (lower.includes("required") || lower.includes("missing"));

          Alert.alert(
            "Could not create account",
            needsEmail
              ? "This Portl workspace still requires an email address at sign-up. An admin needs to set Email to Optional in the Clerk Dashboard under User & authentication."
              : message ||
                  "Check your details and try again. If the username is rejected, it may already be taken.",
          );
        } finally {
          setBusy(false);
        }
      })();
    });
  };

  return (
    <Screen keyboard centered>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerClassName="grow justify-center gap-6 p-6"
          keyboardShouldPersistTaps="handled"
        >
          {/* Left-aligned heading + inline switch, per the reference. */}
          <View className="gap-1">
            <Text className="text-display text-ink">Create an account</Text>
            <Text className="text-label text-ink-muted">
              Already registered?{" "}
              <Link href={"/(auth)/sign-in" as never} asChild>
                <Text className="text-label text-primary-text">Sign in</Text>
              </Link>
            </Text>
          </View>

          <View className="gap-4">
            <Field
              label="Username"
              leadingIcon="person"
              value={form.values.username}
              onChangeText={form.setField("username")}
              onBlur={form.blur("username")}
              error={form.errors.username}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username-new"
              textContentType="username"
              placeholder="yourname"
              returnKeyType="next"
            />
            <View className="gap-2">
              <Field
                label="Password"
                leadingIcon="lock"
                value={form.values.password}
                onChangeText={form.setField("password")}
                onBlur={form.blur("password")}
                error={form.errors.password}
                secureTextEntry
                secureToggle
                autoComplete="new-password"
                textContentType="newPassword"
                placeholder="Create a password"
                returnKeyType="done"
                onSubmitEditing={onCreate}
              />
              <PasswordStrengthHints password={String(form.values.password)} />
            </View>
          </View>

          <View className="gap-4">
            <Button title="Create account" onPress={onCreate} loading={busy} />

            {/* Sets expectations for the contact step that now lives inside. */}
            <Text className="text-center text-caption text-ink-muted">
              You can add an email or phone number later in Profile. Verifying
              one is what links you to your society.
            </Text>
          </View>

          <View className="gap-3">
            <AuthOrDivider label="Or register with" />
            <GoogleSignInButton label="Continue with Google" disabled={busy} />
            <GoogleSignInExpoGoHint />
          </View>

          <AuthFooterLegal />

          <Link href={"/(auth)/sign-in" as never} asChild>
            <Pressable
              accessibilityRole="link"
              className="min-h-11 justify-center"
            >
              <Text className="text-center text-label text-ink">
                Already have an account?{" "}
                <Text className="text-primary-text">Sign in</Text>
              </Text>
            </Pressable>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
