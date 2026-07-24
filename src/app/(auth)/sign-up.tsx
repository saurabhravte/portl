import { BrandMark } from "@/components/BrandMark";
import { Button, Field, Screen } from "@/components/ui";
import { AuthMethodPicker } from "@/features/auth/AuthMethodPicker";
import { GoogleSignInButton, GoogleSignInExpoGoHint } from "@/features/auth/GoogleSignInButton";
import { PasswordStrengthHints } from "@/features/auth/PasswordStrengthHints";
import {
  clerkErrorMessage,
  type IdentityType,
  isValidIdentity,
} from "@/features/auth/identity";
import {
  emailPasswordSchema,
  getPasswordStrength,
  parseInput,
  phoneSchema,
  verificationCodeSchema,
} from "@/lib/validation";
import { useSignUp } from "@clerk/expo";
import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, Text } from "react-native";

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
  const [method, setMethod] = useState<IdentityType>("phone");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"form" | "verify">("form");
  const [busy, setBusy] = useState(false);

  const passwordStrong = getPasswordStrength(password).isStrong;

  const onCreate = async () => {
    if (!signUp) return;
    setBusy(true);
    try {
      if (method === "phone") {
        const phoneNumber = parseInput(phoneSchema, phone);
        const { error } = await signUp.create({
          phoneNumber,
        });
        if (error) throw error;
        const { error: sendError } = await signUp.verifications.sendPhoneCode();
        if (sendError) throw sendError;
      } else {
        if (!passwordStrong) {
          throw new Error(
            "Use a strong password: 8+ characters with uppercase, lowercase, number, and special character.",
          );
        }
        const credentials = parseInput(emailPasswordSchema, { email, password });
        const { error } = await signUp.password({
          emailAddress: credentials.email,
          password: credentials.password,
        });
        if (error) throw error;
        const { error: sendError } = await signUp.verifications.sendEmailCode();
        if (sendError) throw sendError;
      }
      setCode("");
      setStage("verify");
    } catch (error) {
      Alert.alert(
        "Could not create account",
        clerkErrorMessage(error, "Check your details and try again."),
      );
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async () => {
    if (!signUp) return;
    setBusy(true);
    try {
      const parsedCode = parseInput(verificationCodeSchema, code);
      const result =
        method === "phone"
          ? await signUp.verifications.verifyPhoneCode({ code: parsedCode })
          : await signUp.verifications.verifyEmailCode({ code: parsedCode });
      if (result.error) throw result.error;

      // Only finalize when Clerk reports a completable sign-up with a session.
      if (signUp.status !== "complete") {
        throw new Error(
          "Sign-up is not complete yet. Check that email/phone verification is enabled in Clerk, then try again.",
        );
      }

      const { error: finalizeError } = await signUp.finalize();
      if (finalizeError) throw finalizeError;
      router.replace("/");
    } catch (error) {
      alertVerifyError(error);
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    if (!signUp) return;
    setBusy(true);
    try {
      const { error } =
        method === "phone"
          ? await signUp.verifications.sendPhoneCode()
          : await signUp.verifications.sendEmailCode();
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
    setStage("form");
  };

  return (
    <Screen className="justify-center gap-4 p-6">
      <BrandMark size="md" />
      <Text className="text-title text-ink">
        {stage === "form"
          ? "Create your account"
          : `Check your ${method === "phone" ? "phone" : "email"}`}
      </Text>
      {stage === "form" ? (
        <>
          <GoogleSignInButton
            label="Sign up with Google"
            disabled={busy}
          />
          <GoogleSignInExpoGoHint />
          <AuthMethodPicker value={method} onChange={setMethod} disabled={busy} />
          {method === "phone" ? (
            <Field
              label="Phone number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              placeholder="+91 98765 43210"
            />
          ) : (
            <>
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                placeholder="you@example.com"
              />
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                placeholder="Strong password"
              />
              <PasswordStrengthHints password={password} />
            </>
          )}
          <Button
            title="Continue"
            onPress={onCreate}
            loading={busy}
            disabled={
              method === "phone"
                ? !isValidIdentity("phone", phone)
                : !isValidIdentity("email", email) || !passwordStrong
            }
          />
        </>
      ) : (
        <>
          <Field
            label="6-digit code"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            maxLength={6}
            autoFocus
          />
          <Button
            title="Verify and sign in"
            onPress={onVerify}
            loading={busy}
            disabled={code.length < 6}
          />
          <Button
            title="Resend code"
            variant="ghost"
            onPress={resendCode}
            disabled={busy}
          />
          <Button
            title="Start over"
            variant="ghost"
            onPress={startOver}
            disabled={busy}
          />
        </>
      )}
      <Text className="text-caption text-ink-muted">
        Use the same verified phone or email your society invited. Portl never
        trusts this form alone; the server verifies your signed-in identity.
      </Text>
      {stage === "form" ? (
        <Link href={"/(auth)/sign-in" as any} asChild>
          <Pressable accessibilityRole="link" className="min-h-11 justify-center">
            <Text className="text-center text-label text-ink">
              Already have an account? Sign in
            </Text>
          </Pressable>
        </Link>
      ) : null}
    </Screen>
  );
}
