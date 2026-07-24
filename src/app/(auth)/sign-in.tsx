import { BrandMark } from "@/components/BrandMark";
import { Button, Field, Screen } from "@/components/ui";
import {
  AuthFooterLegal,
  AuthOrDivider,
} from "@/features/auth/AuthChrome";
import { GoogleSignInButton, GoogleSignInExpoGoHint } from "@/features/auth/GoogleSignInButton";
import { clerkErrorMessage } from "@/features/auth/identity";
import { useZodForm } from "@/lib/useZodForm";
import {
  parseInput,
  signInFormSchema,
  verificationCodeSchema,
} from "@/lib/validation";
import { useSignIn } from "@clerk/expo";
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

type Stage = "form" | "client-trust";

export default function SignIn() {
  const { signIn } = useSignIn();
  const router = useRouter();
  const form = useZodForm(signInFormSchema, {
    identifier: "",
    password: "",
  });
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | undefined>();
  const [stage, setStage] = useState<Stage>("form");
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    if (!signIn || signIn.status !== "complete") {
      throw new Error("Sign-in needs another verification step.");
    }
    const { error } = await signIn.finalize();
    if (error) throw error;
    router.replace("/");
  };

  const onSignIn = () => {
    form.submit((data) => {
      void (async () => {
        if (!signIn) return;
        setBusy(true);
        try {
          const identifier = data.identifier.includes("@")
            ? data.identifier.toLowerCase()
            : data.identifier;
          const { error } = await signIn.password({
            identifier,
            password: data.password,
          });
          if (error) throw error;

          if (signIn.status === "complete") {
            await finish();
            return;
          }
          if (signIn.status === "needs_client_trust") {
            const factor = signIn.supportedSecondFactors.find(
              (candidate) => candidate.strategy === "email_code",
            );
            if (!factor) {
              throw new Error("No supported verification method found.");
            }
            const { error: sendError } = await signIn.mfa.sendEmailCode();
            if (sendError) throw sendError;
            setCode("");
            setCodeError(undefined);
            setStage("client-trust");
            return;
          }
          throw new Error("This account requires an additional sign-in factor.");
        } catch (error) {
          Alert.alert(
            "Sign in failed",
            clerkErrorMessage(error, "Check your email/username and password."),
          );
        } finally {
          setBusy(false);
        }
      })();
    });
  };

  const verifyCode = async () => {
    if (!signIn) return;
    setBusy(true);
    try {
      const parsedCode = parseInput(verificationCodeSchema, code);
      setCodeError(undefined);
      const result = await signIn.mfa.verifyEmailCode({ code: parsedCode });
      if (result.error) throw result.error;
      await finish();
    } catch (error) {
      if (error instanceof Error && /6-digit/i.test(error.message)) {
        setCodeError(error.message);
      } else {
        const message = clerkErrorMessage(error, "Check the code and try again.");
        const wrongCode =
          /wrong|invalid|incorrect|code/i.test(message) &&
          !/session/i.test(message);
        Alert.alert(wrongCode ? "Wrong code" : "Verification failed", message);
      }
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    if (!signIn) return;
    setBusy(true);
    try {
      const { error } = await signIn.mfa.sendEmailCode();
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
    signIn?.reset();
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
          <BrandMark
            size="lg"
            showWordmark
            subtitle={
              stage === "client-trust"
                ? "Enter the code we sent you."
                : "Stay signed in — open Portl anytime."
            }
          />
          <Text className="text-center text-title text-ink">
            {stage === "client-trust" ? "Verify it's you" : "Login Account"}
          </Text>

          {stage === "client-trust" ? (
            <View className="gap-4">
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
                title="Verify and sign in"
                onPress={() => void verifyCode()}
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
          ) : (
            <>
              <Field
                label="Email or username"
                value={form.values.identifier}
                onChangeText={form.setField("identifier")}
                onBlur={form.blur("identifier")}
                error={form.errors.identifier}
                autoCapitalize="none"
                autoComplete="username"
                textContentType="username"
                placeholder="you@example.com or yourname"
              />
              <Field
                label="Password"
                value={form.values.password}
                onChangeText={form.setField("password")}
                onBlur={form.blur("password")}
                error={form.errors.password}
                secureTextEntry
                secureToggle
                autoComplete="current-password"
                textContentType="password"
                placeholder="••••••••"
              />
              <Button title="Sign in" onPress={onSignIn} loading={busy} />
              <Link href={"/(auth)/forgot-password" as any} asChild>
                <Pressable
                  accessibilityRole="link"
                  className="min-h-11 justify-center"
                >
                  <Text className="text-center text-label text-ink">
                    Forgotten your password?{" "}
                    <Text className="text-primary">Reset Password</Text>
                  </Text>
                </Pressable>
              </Link>

              <AuthOrDivider label="Or sign in with" />
              <GoogleSignInButton disabled={busy} />
              <GoogleSignInExpoGoHint />

              <AuthFooterLegal />
              <Link href={"/(auth)/sign-up" as any} asChild>
                <Pressable
                  accessibilityRole="link"
                  className="min-h-11 justify-center"
                >
                  <Text className="text-center text-label text-ink">
                    I don't have an account,{" "}
                    <Text className="text-primary">Sign up</Text>
                  </Text>
                </Pressable>
              </Link>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
