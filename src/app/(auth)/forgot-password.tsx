import { Button, Field, Screen } from "@/components/ui";
import { AuthMethodPicker } from "@/features/auth/AuthMethodPicker";
import { PasswordStrengthHints } from "@/features/auth/PasswordStrengthHints";
import {
  clerkErrorMessage,
  type IdentityType,
  isValidIdentity,
} from "@/features/auth/identity";
import {
  authIdentitySchema,
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

export default function ForgotPassword() {
  const { signIn } = useSignIn();
  const router = useRouter();
  const [method, setMethod] = useState<IdentityType>("email");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState<Stage>("identifier");
  const [busy, setBusy] = useState(false);

  const resetFlow = () => {
    signIn?.reset();
    setCode("");
    setPassword("");
    setStage("identifier");
  };

  const sendCode = async (resend = false) => {
    if (!signIn) return;
    setBusy(true);
    try {
      if (!resend) {
        const identity = parseInput(authIdentitySchema, {
          type: method,
          value: identifier,
        });
        const { error } = await signIn.create({
          identifier: identity.value,
        });
        if (error) throw error;
      }
      const { error } =
        method === "email"
          ? await signIn.resetPasswordEmailCode.sendCode()
          : await signIn.resetPasswordPhoneCode.sendCode();
      if (error) throw error;
      setStage("code");
      if (resend) Alert.alert("Code sent", "A new reset code is on its way.");
    } catch (error) {
      Alert.alert(
        "Could not send reset code",
        clerkErrorMessage(error, "Check your details and try again."),
      );
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!signIn) return;
    setBusy(true);
    try {
      const parsedCode = parseInput(verificationCodeSchema, code);
      const { error } =
        method === "email"
          ? await signIn.resetPasswordEmailCode.verifyCode({ code: parsedCode })
          : await signIn.resetPasswordPhoneCode.verifyCode({ code: parsedCode });
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
      const { error } =
        method === "email"
          ? await signIn.resetPasswordEmailCode.submitPassword({
              password: parsed.password,
              signOutOfOtherSessions: true,
            })
          : await signIn.resetPasswordPhoneCode.submitPassword({
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
      Alert.alert(
        "Could not reset password",
        clerkErrorMessage(error, "Choose a different password and try again."),
      );
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
            We’ll send a reset code to a verified identifier on your account.
          </Text>
          <AuthMethodPicker value={method} onChange={setMethod} disabled={busy} />
          <Field
            label={method === "email" ? "Email" : "Phone number"}
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            keyboardType={method === "email" ? "email-address" : "phone-pad"}
            textContentType={
              method === "email" ? "emailAddress" : "telephoneNumber"
            }
            placeholder={method === "email" ? "you@example.com" : "+91 98765 43210"}
          />
          <Button
            title="Send reset code"
            onPress={() => sendCode()}
            loading={busy}
            disabled={!isValidIdentity(method, identifier)}
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
            onPress={verifyCode}
            loading={busy}
            disabled={code.length < 6}
          />
          <Button
            title="Resend code"
            variant="ghost"
            onPress={() => sendCode(true)}
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
            Choose a strong password: 8+ characters with uppercase, lowercase,
            number, and special character.
          </Text>
          <Field
            label="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            autoFocus
          />
          <PasswordStrengthHints password={password} />
          <Button
            title="Set new password"
            onPress={setNewPassword}
            loading={busy}
            disabled={!getPasswordStrength(password).isStrong}
          />
        </>
      ) : null}
    </Screen>
  );
}
