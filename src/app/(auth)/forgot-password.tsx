import { Button, Field, Screen } from "@/components/ui";
import { PasswordStrengthHints } from "@/features/auth/PasswordStrengthHints";
import { clerkErrorMessage } from "@/features/auth/identity";
import {
  emailSchema,
  getPasswordStrength,
  parseInput,
  resetPasswordSchema,
  verificationCodeSchema,
} from "@/lib/validation";
import { useSignIn } from "@clerk/expo";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Text } from "react-native";

type Stage = "identifier" | "code" | "password";

/** Password reset is email-only — phone is never a Portl sign-in method. */
export default function ForgotPassword() {
  const { signIn } = useSignIn();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [stage, setStage] = useState<Stage>("identifier");
  const [busy, setBusy] = useState(false);

  const resetFlow = () => {
    signIn?.reset();
    setCode("");
    setPassword("");
    setPasswordError(undefined);
    setStage("identifier");
  };

  const sendCode = async (resend = false) => {
    if (!signIn) return;
    setBusy(true);
    try {
      if (!resend) {
        const parsedEmail = parseInput(emailSchema, email);
        setEmailError(undefined);
        const { error } = await signIn.create({
          identifier: parsedEmail,
        });
        if (error) throw error;
      }
      const { error } = await signIn.resetPasswordEmailCode.sendCode();
      if (error) throw error;
      setStage("code");
      if (resend) Alert.alert("Code sent", "A new reset code is on its way.");
    } catch (error) {
      if (error instanceof Error && /email/i.test(error.message)) {
        setEmailError(error.message);
      } else {
        Alert.alert(
          "Could not send reset code",
          clerkErrorMessage(error, "Check your email and try again."),
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!signIn) return;
    setBusy(true);
    try {
      const parsedCode = parseInput(verificationCodeSchema, code);
      const { error } = await signIn.resetPasswordEmailCode.verifyCode({
        code: parsedCode,
      });
      if (error) throw error;
      if (signIn.status !== "needs_new_password") {
        throw new Error("Password reset could not continue.");
      }
      setStage("password");
    } catch (error) {
      Alert.alert(
        "Verification failed",
        clerkErrorMessage(error, "Check the reset code and try again."),
      );
    } finally {
      setBusy(false);
    }
  };

  const setNewPassword = async () => {
    if (!signIn) return;
    setBusy(true);
    try {
      const parsed = parseInput(resetPasswordSchema, { password });
      setPasswordError(undefined);
      const { error } = await signIn.resetPasswordEmailCode.submitPassword({
        password: parsed.password,
        signOutOfOtherSessions: true,
      });
      if (error) throw error;
      if (signIn.status !== "complete") {
        throw new Error("This account requires another sign-in factor.");
      }
      const { error: finalizeError } = await signIn.finalize();
      if (finalizeError) throw finalizeError;
      router.replace("/");
    } catch (error) {
      if (error instanceof Error && /Password must/i.test(error.message)) {
        setPasswordError(error.message);
      } else {
        Alert.alert(
          "Could not reset password",
          clerkErrorMessage(error, "Choose a different password and try again."),
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen className="justify-center gap-4 p-6">
      <Text className="text-title text-ink">Reset your password</Text>
      {stage === "identifier" ? (
        <>
          <Text className="text-body text-ink-soft">
            We’ll send a reset code to the email on your account.
          </Text>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            error={emailError}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="you@example.com"
          />
          <Button
            title="Send reset code"
            onPress={() => void sendCode()}
            loading={busy}
            disabled={!email.trim()}
          />
          <Button
            title="Back to sign in"
            variant="ghost"
            onPress={() => router.replace("/(auth)/sign-in")}
          />
        </>
      ) : null}

      {stage === "code" ? (
        <>
          <Text className="text-body text-ink-soft">
            Enter the 6-digit code we sent you.
          </Text>
          <Field
            label="Reset code"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            maxLength={6}
            autoFocus
          />
          <Button
            title="Verify code"
            onPress={() => void verifyCode()}
            loading={busy}
            disabled={code.length < 6}
          />
          <Button
            title="Resend code"
            variant="ghost"
            onPress={() => void sendCode(true)}
            disabled={busy}
          />
          <Button
            title="Start over"
            variant="ghost"
            onPress={resetFlow}
            disabled={busy}
          />
        </>
      ) : null}

      {stage === "password" ? (
        <>
          <Text className="text-body text-ink-soft">
            Choose a strong password: 8+ characters with uppercase, number, and
            special character.
          </Text>
          <Field
            label="New password"
            value={password}
            onChangeText={setPassword}
            error={passwordError}
            secureTextEntry
            secureToggle
            autoComplete="new-password"
            textContentType="newPassword"
            autoFocus
          />
          <PasswordStrengthHints password={password} />
          <Button
            title="Set new password"
            onPress={() => void setNewPassword()}
            loading={busy}
            disabled={!getPasswordStrength(password).isStrong}
          />
        </>
      ) : null}
    </Screen>
  );
}
