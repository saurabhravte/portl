import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui";
import { useSessionStore } from "@/stores/session";
import { useThemeColors } from "@/theme/useThemeColors";
import { useAuth } from "@clerk/expo";
import { ActivityIndicator, Text, View } from "react-native";

/**
 * Landing while RoleGate restores the session and routes by role.
 *
 * This screen is now transient only. The `pendingVerification` and `unlinked`
 * states used to terminate here with "ask an admin to invite your verified
 * phone or email" — a dead end for anyone who had simply not verified yet.
 * Both are routed to `(auth)/pending-access` instead, so the only case left
 * to render here is a genuine fetch failure, which is retryable.
 */
export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();
  const colors = useThemeColors();
  const { profileStatus, profileError, retryProfile } = useSessionStore();

  const restoring =
    !isLoaded ||
    (isSignedIn &&
      (profileStatus === "loading" ||
        profileStatus === "pendingVerification" ||
        profileStatus === "unlinked"));

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-paper">
      <BrandMark size="lg" showWordmark subtitle="Restoring your session…" />
      {restoring ? <ActivityIndicator color={colors.ink} /> : null}
      {isSignedIn && profileStatus === "failed" ? (
        <>
          <Text
            accessibilityRole="alert"
            className="px-8 text-center text-body text-ink-soft"
          >
            {profileError ?? "Couldn’t load your profile."}
          </Text>
          <Button title="Try again" onPress={retryProfile} />
        </>
      ) : null}
    </View>
  );
}
