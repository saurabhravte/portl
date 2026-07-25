import { Button, Field, Screen } from "@/components/ui";
import {
  AuthFooterLegal,
  AuthOrDivider,
  AuthScreenTopBar,
} from "@/features/auth/AuthChrome";
import {
  GoogleSignInButton,
  GoogleSignInExpoGoHint,
} from "@/features/auth/GoogleSignInButton";
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

/**
 * Login — Phases 6.1, 6.3 and 6.4.
 *
 * Matches the supplied reference: left-aligned heading, "New user? Create an
 * account" directly beneath it, two iconed fields, an inline "Forgot
 * password?", one full-width CTA, an "or" rule, then social.
 *
 * REMOVED (6.3, no visual noise)
 *   * `AuthMethodPicker` — a two-tab Email/Phone switch with Phone
 *     permanently disabled. A picker with one usable option is decoration
 *     that also advertises a sign-in method the app does not support.
 *   * `authFieldClassName` — a screen-local override that gave these inputs
 *     `rounded-xl border-0` while every other input in the app is
 *     `rounded-md` with a border. Deleted; <Field> is the single source.
 *   * `AuthPrimaryButton` / `AuthSocialRow` — see the note in AuthChrome.
 *
 * KEPT
 *   The `needs_client_trust` second-factor stage. It is not sign-up
 *   verification and does not block new users; it only fires for accounts
 *   that already have 2FA enabled, where skipping it would be a real
 *   regression.
 */
export default function SignIn() {
  const { signIn } = useSignIn();
  const router = useRouter();
  const form = useZodForm(signInFormSchema, { identifier: "", password: "" });
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
            clerkErrorMessage(error, "Check your username and password."),
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
          /wrong|invalid|incorrect|code/i.test(message) && !/session/i.test(message);
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
    <Screen edges={["top", "bottom"]} keyboard centered>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerClassName="grow justify-center gap-6 p-6"
          keyboardShouldPersistTaps="handled"
        >
          <AuthScreenTopBar />

          {stage === "client-trust" ? (
            <View className="gap-6">
              <View className="gap-1">
                <Text className="text-display text-ink">Verify it's you</Text>
                <Text className="text-body text-ink-muted">
                  Enter the 6-digit code we just sent you.
                </Text>
              </View>
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
              <View className="gap-3">
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
            </View>
          ) : (
            <>
              <View className="gap-1">
                <Text className="text-display text-ink">Sign in</Text>
                <Text className="text-label text-ink-muted">
                  New user?{" "}
                  <Link href={"/(auth)/sign-up" as never} asChild>
                    <Text className="text-label text-primary-text">
                      Create an account
                    </Text>
                  </Link>
                </Text>
              </View>

              <View className="gap-4">
                <Field
                  label="Username or email"
                  leadingIcon="person"
                  value={form.values.identifier}
                  onChangeText={form.setField("identifier")}
                  onBlur={form.blur("identifier")}
                  error={form.errors.identifier}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
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
                    autoComplete="current-password"
                    textContentType="password"
                    placeholder="Your password"
                    returnKeyType="done"
                    onSubmitEditing={onSignIn}
                  />
                  <Link href={"/(auth)/forgot-password" as never} asChild>
                    <Pressable
                      accessibilityRole="link"
                      className="min-h-11 justify-center self-start"
                      hitSlop={8}
                    >
                      <Text className="text-caption text-primary-text">
                        Forgot password?
                      </Text>
                    </Pressable>
                  </Link>
                </View>
              </View>

              <Button title="Login" onPress={onSignIn} loading={busy} />

              <View className="gap-3">
                <AuthOrDivider label="or" />
                <GoogleSignInButton
                  label="Continue with Google"
                  disabled={busy}
                />
                <GoogleSignInExpoGoHint />
              </View>

              <AuthFooterLegal />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
