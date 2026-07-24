import { BrandMark } from "@/components/BrandMark";
import { Button, Field, Screen } from "@/components/ui";
import {
  AuthFooterLegal,
  AuthOrDivider,
} from "@/features/auth/AuthChrome";
import { GoogleSignInButton, GoogleSignInExpoGoHint } from "@/features/auth/GoogleSignInButton";
import { PasswordStrengthHints } from "@/features/auth/PasswordStrengthHints";
import { clerkErrorMessage } from "@/features/auth/identity";
import { useZodForm } from "@/lib/useZodForm";
import {
  signUpFormSchema,
  verificationCodeSchema,
  parseInput,
} from "@/lib/validation";
import { useSignUp } from "@clerk/expo";
import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";

function alertVerifyError(error: unknown) {
  const message = clerkErrorMessage(
    error,
    "Check the 6-digit code and try again.",
  );
  const lower = message.toLowerCase();

  if (
    lower.includes("cannot finalize") ||
    lower.includes("without a created session") ||
    lower.includes("session")
  ) {
    Alert.alert(
      "Could not finish sign-up",
      "Verification succeeded but no session was created. Start over, or try Google / email again. If this keeps happening, check Clerk Dashboard → User & authentication (email verification and session settings).",
    );
    return;
  }

  if (
    lower.includes("incorrect") ||
    lower.includes("invalid") ||
    lower.includes("wrong") ||
    lower.includes("code")
  ) {
    Alert.alert("Wrong code", message);
    return;
  }

  Alert.alert("Verification failed", message);
}

export default function SignUp() {
  const { signUp } = useSignUp();
  const router = useRouter();
  const form = useZodForm(signUpFormSchema, {
    username: "",
    email: "",
    password: "",
    phone: "",
  });
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | undefined>();
  const [stage, setStage] = useState<"form" | "verify">("form");
  const [busy, setBusy] = useState(false);

  const onCreate = () => {
    form.submit((data) => {
      void (async () => {
        if (!signUp) return;
        setBusy(true);
        try {
          const { error } = await signUp.password({
            emailAddress: data.email,
            password: data.password,
            username: data.username,
            unsafeMetadata: { contactPhone: data.phone },
          });
          if (error) throw error;
          const { error: sendError } = await signUp.verifications.sendEmailCode();
          if (sendError) throw sendError;
          setCode("");
          setCodeError(undefined);
          setStage("verify");
        } catch (error) {
          Alert.alert(
            "Could not create account",
            clerkErrorMessage(
              error,
              "Check your details and try again. If username is rejected, enable Username in the Clerk Dashboard.",
            ),
          );
        } finally {
          setBusy(false);
        }
      })();
    });
  };

  const onVerify = async () => {
    if (!signUp) return;
    setBusy(true);
    try {
      const parsedCode = parseInput(verificationCodeSchema, code);
      setCodeError(undefined);
      const result = await signUp.verifications.verifyEmailCode({
        code: parsedCode,
      });
      if (result.error) throw result.error;

      if (signUp.status !== "complete") {
        throw new Error(
          "Sign-up is not complete yet. Check that email verification is enabled in Clerk, then try again.",
        );
      }

      const { error: finalizeError } = await signUp.finalize();
      if (finalizeError) throw finalizeError;
      router.replace("/");
    } catch (error) {
      if (error instanceof Error && /6-digit/i.test(error.message)) {
        setCodeError(error.message);
      } else {
        alertVerifyError(error);
      }
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    if (!signUp) return;
    setBusy(true);
    try {
      const { error } = await signUp.verifications.sendEmailCode();
      if (error) throw error;
      Alert.alert("Code sent", "A new verification code is on its way.");
    } catch (error) {
      Alert.alert(
        "Could not resend code",
        clerkErrorMessage(error, "Try again in a moment."),
      );
    } finally {
      setBusy(false);
    }
  };

  const startOver = () => {
    signUp?.reset();
    setCode("");
    setCodeError(undefined);
    setStage("form");
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
            {stage === "form" ? "Create Your Account" : "Check your email"}
          </Text>

          {stage === "form" ? (
            <>
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
                label="Email"
                value={form.values.email}
                onChangeText={form.setField("email")}
                onBlur={form.blur("email")}
                error={form.errors.email}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                placeholder="you@example.com"
              />
              <Field
                label="Password"
                value={form.values.password}
                onChangeText={form.setField("password")}
                onBlur={form.blur("password")}
                error={form.errors.password}
                secureTextEntry
                secureToggle
                autoComplete="new-password"
                textContentType="newPassword"
                placeholder="Strong password"
              />
              <PasswordStrengthHints password={String(form.values.password)} />
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
              <Text className="text-caption text-ink-muted">
                Phone is for society contact only — you sign in with email or
                username, never phone.
              </Text>

              <Button title="Sign up" onPress={onCreate} loading={busy} />

              <AuthOrDivider label="Or register with" />
              <GoogleSignInButton label="Create account" disabled={busy} />
              <GoogleSignInExpoGoHint />

              <AuthFooterLegal />
              <Link href={"/(auth)/sign-in" as any} asChild>
                <Pressable
                  accessibilityRole="link"
                  className="min-h-11 justify-center"
                >
                  <Text className="text-center text-label text-ink">
                    Already have an Account?{" "}
                    <Text className="text-primary">Login</Text>
                  </Text>
                </Pressable>
              </Link>
            </>
          ) : (
            <View className="gap-4">
              <Text className="text-center text-body text-ink-soft">
                Enter the 6-digit code we sent to verify your email.
              </Text>
              <Field
                label="6-digit code"
                value={code}
                onChangeText={setCode}
                error={codeError}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                maxLength={6}
                autoFocus
              />
              <Button
                title="Verify and continue"
                onPress={() => void onVerify()}
                loading={busy}
                disabled={code.length < 6}
              />
              <Button
                title="Resend code"
                variant="ghost"
                onPress={() => void resendCode()}
                disabled={busy}
              />
              <Button
                title="Start over"
                variant="ghost"
                onPress={startOver}
                disabled={busy}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
