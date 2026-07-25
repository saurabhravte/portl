import { AppIcon, Badge, Button, Card, Field, SectionTitle } from "@/components/ui";
import { clerkErrorMessage, isValidIdentity } from "@/features/auth/identity";
import { useSessionStore } from "@/stores/session";
import { useThemeColors } from "@/theme/useThemeColors";
import { useUser } from "@clerk/expo";
import React, { useState } from "react";
import { Alert, Text, View } from "react-native";

type Channel = "email" | "phone";

/**
 * Contact details — Phases 2.2, 2.3 and 2.4.
 *
 * Email and phone collection plus their verification used to live inside the
 * sign-up flow, where they blocked account creation. They live here now, and
 * this component is mounted in two places:
 *
 *   * Profile -> Contact details, for users already inside the app.
 *   * `/(auth)/pending-access`, the lobby for a signed-in user who has no
 *     society yet — same component, so there is exactly one implementation
 *     of "add and verify a contact".
 *
 * Verifying either channel calls `retryProfile()`, which re-runs the invite
 * claim in the root layout. That is the whole point of verification in Portl:
 * it is not a hoop, it is how the app matches you to your society's invite.
 */

interface Props {
  /** Lobby framing when the user has no society yet. */
  emphasis?: "settings" | "onboarding";
}

export function ContactDetailsSection({ emphasis = "settings" }: Props) {
  const { user } = useUser();
  const colors = useThemeColors();
  const retryProfile = useSessionStore((s) => s.retryProfile);

  const [channel, setChannel] = useState<Channel>("email");
  const [value, setValue] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(emphasis === "onboarding");

  const email = user?.primaryEmailAddress;
  const phone = user?.primaryPhoneNumber;
  const emailVerified = email?.verification?.status === "verified";
  const phoneVerified = phone?.verification?.status === "verified";
  const anyVerified = emailVerified || phoneVerified;

  const reset = () => {
    setSent(false);
    setCode("");
    setValue("");
    setAdding(emphasis === "onboarding");
  };

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
        const created = await user.createPhoneNumber({
          phoneNumber: value.trim(),
        });
        await created.prepareVerification();
      }
      setSent(true);
    } catch (error) {
      Alert.alert(
        "Couldn't send the code",
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
      if (!target) {
        throw new Error("That contact is no longer on your account.");
      }

      await target.attemptVerification({ code: code.trim() });
      await user.reload();

      reset();
      // Verified — the root layout can now attempt the invite claim.
      retryProfile();
    } catch (error) {
      Alert.alert(
        "Couldn't verify",
        clerkErrorMessage(error, "Check the code and try again."),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-3">
      {emphasis === "settings" ? (
        <SectionTitle>Contact details</SectionTitle>
      ) : null}

      <Card className="gap-4">
        {/* Current state, so the user can see what Portl already knows. */}
        <View className="gap-3">
          <ContactRow
            icon="mail"
            label="Email"
            value={email?.emailAddress ?? null}
            verified={emailVerified}
            color={colors.inkMuted}
          />
          <View className="h-px bg-border" />
          <ContactRow
            icon="phone"
            label="Phone"
            value={phone?.phoneNumber ?? null}
            verified={phoneVerified}
            color={colors.inkMuted}
          />
        </View>

        {!anyVerified ? (
          <Text className="text-caption text-ink-muted">
            Verifying one contact is how your society matches you to its
            invitation. Neither is required to use your account.
          </Text>
        ) : null}

        {!adding ? (
          <Button
            title={anyVerified ? "Add another contact" : "Add and verify"}
            variant="secondary"
            onPress={() => setAdding(true)}
          />
        ) : !sent ? (
          <View className="gap-3">
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button
                  title="Email"
                  size="sm"
                  variant={channel === "email" ? "primary" : "secondary"}
                  selected={channel === "email"}
                  onPress={() => setChannel("email")}
                />
              </View>
              <View className="flex-1">
                <Button
                  title="Phone"
                  size="sm"
                  variant={channel === "phone" ? "primary" : "secondary"}
                  selected={channel === "phone"}
                  onPress={() => setChannel("phone")}
                />
              </View>
            </View>
            <Field
              label={channel === "email" ? "Email address" : "Phone number"}
              leadingIcon={channel === "email" ? "mail" : "phone"}
              value={value}
              onChangeText={setValue}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={channel === "email" ? "email-address" : "phone-pad"}
              textContentType={
                channel === "email" ? "emailAddress" : "telephoneNumber"
              }
              placeholder={
                channel === "email" ? "you@example.com" : "+91 98765 43210"
              }
            />
            <Button
              title="Send code"
              onPress={() => void sendCode()}
              loading={busy}
            />
            {emphasis === "settings" ? (
              <Button
                title="Cancel"
                variant="ghost"
                onPress={reset}
                disabled={busy}
              />
            ) : null}
          </View>
        ) : (
          <View className="gap-3">
            <Text className="text-body text-ink-soft">
              Enter the code we sent to {value.trim()}.
            </Text>
            <Field
              label="Verification code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              maxLength={6}
              placeholder="123456"
              autoFocus
            />
            <Button
              title="Verify"
              onPress={() => void confirmCode()}
              loading={busy}
              disabled={code.trim().length < 6}
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
          </View>
        )}
      </Card>
    </View>
  );
}

function ContactRow({
  icon,
  label,
  value,
  verified,
  color,
}: {
  icon: "mail" | "phone";
  label: string;
  value: string | null;
  verified: boolean;
  color: string;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <AppIcon name={icon} size={18} color={color} />
      <View className="flex-1">
        <Text className="text-caption text-ink-muted">{label}</Text>
        <Text className="text-body text-ink" numberOfLines={1}>
          {value ?? "Not added"}
        </Text>
      </View>
      {value ? (
        <Badge
          label={verified ? "Verified" : "Unverified"}
          tone={verified ? "approve" : "warn"}
        />
      ) : null}
    </View>
  );
}
