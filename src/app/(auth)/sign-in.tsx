import { BrandMark } from "@/components/BrandMark";
import { Button, Field, Screen } from "@/components/ui";
import { AuthMethodPicker } from "@/features/auth/AuthMethodPicker";
import { GoogleSignInButton, GoogleSignInExpoGoHint } from "@/features/auth/GoogleSignInButton";
import {
  clerkErrorMessage,
  type IdentityType,
  isValidIdentity,
} from "@/features/auth/identity";
import {
  emailPasswordSchema,
  parseInput,
  phoneSchema,
  verificationCodeSchema,
} from "@/lib/validation";
import { useSignIn } from "@clerk/expo";
import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, Text } from "react-native";

type Stage = "form" | "phone-code" | "client-trust";

export default function SignIn() {
  const { signIn } = useSignIn();
  const router = useRouter();
  const [method, setMethod] = useState<IdentityType>("phone");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
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

  const onEmailSignIn = async () => {
    if (!signIn) return;
    setBusy(true);
    try {
      const credentials = parseInput(emailPasswordSchema, { email, password });
      const { error } = await signIn.password({
        emailAddress: credentials.email,
        password: credentials.password,
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
        if (!factor) throw new Error("No supported verification method found.");
        const { error: sendError } = await signIn.mfa.sendEmailCode();
        if (sendError) throw sendError;
        setCode("");
        setStage("client-trust");
        return;
      }
      throw new Error("This account requires an additional sign-in factor.");
    } catch (error) {
      Alert.alert(
        "Sign in failed",
        clerkErrorMessage(error, "Check your email and password."),
      );
    } finally {
      setBusy(false);
    }
  };

  const sendPhoneCode = async () => {
    if (!signIn) return;
    setBusy(true);
    try {
      const phoneNumber = parseInput(phoneSchema, identifier);
      const { error: createError } = await signIn.create({
        identifier: phoneNumber,
      });
      if (createError) throw createError;
      const { error } = await signIn.phoneCode.sendCode({ phoneNumber });
      if (error) throw error;
      setCode("");
      setStage("phone-code");
    } catch (error) {
      Alert.alert(
        "Could not send code",
        clerkErrorMessage(error, "Check the phone number and try again."),
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
      const result =
        stage === "phone-code"
          ? await signIn.phoneCode.verifyCode({ code: parsedCode })
          : await signIn.mfa.verifyEmailCode({ code: parsedCode });
      if (result.error) throw result.error;
      await finish();
    } catch (error) {
      const message = clerkErrorMessage(error, "Check the code and try again.");
      const wrongCode =
        /wrong|invalid|incorrect|code/i.test(message) &&
        !/session/i.test(message);
      Alert.alert(
        wrongCode ? "Wrong code" : "Verification failed",
        message,
      );
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    if (!signIn) return;
    setBusy(true);
    try {
      const phoneNumber =
        stage === "phone-code" ? parseInput(phoneSchema, identifier) : undefined;
      const { error } =
        stage === "phone-code"
          ? await signIn.phoneCode.sendCode({
              phoneNumber: phoneNumber!,
            })
          : await signIn.mfa.sendEmailCode();
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
    setStage("form");
  };

  const codeStage = stage !== "form";

  return (
    <Screen className="justify-center gap-4 p-6">
      <BrandMark
        size="lg"
        showWordmark
        subtitle={
          codeStage
            ? "Enter the code we sent you."
            : "Stay signed in — open Portl anytime, no re-login."
        }
      />
      {codeStage ? (
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
            onPress={verifyCode}
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
      ) : (
        <>
          <GoogleSignInButton disabled={busy} />
          <GoogleSignInExpoGoHint />
          <AuthMethodPicker value={method} onChange={setMethod} disabled={busy} />
          {method === "phone" ? (
            <>
              <Field
                label="Phone number"
                value={identifier}
                onChangeText={setIdentifier}
                autoCapitalize="none"
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                placeholder="+91 98765 43210"
              />
              <Button
                title="Send verification code"
                onPress={sendPhoneCode}
                loading={busy}
                disabled={!isValidIdentity("phone", identifier)}
              />
            </>
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
                autoComplete="current-password"
                textContentType="password"
                placeholder="••••••••"
              />
              <Button
                title="Sign in"
                onPress={onEmailSignIn}
                loading={busy}
                disabled={!isValidIdentity("email", email) || !password}
              />
              <Link href={"/(auth)/forgot-password" as any} asChild>
                <Pressable accessibilityRole="link" className="min-h-11 justify-center">
                  <Text className="text-center text-label text-ink">
                    Forgot password?
                  </Text>
                </Pressable>
              </Link>
            </>
          )}
          <Link href={"/(auth)/sign-up" as any} asChild>
            <Pressable accessibilityRole="link" className="min-h-11 justify-center">
              <Text className="text-center text-label text-ink">
                New here? Create an account
              </Text>
            </Pressable>
          </Link>
        </>
      )}
    </Screen>
  );
}
