import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui";
import { useSessionStore } from "@/stores/session";
import { color } from "@/theme/tokens";
import { useAuth } from "@clerk/expo";
import { ActivityIndicator, Text, View } from "react-native";

/** Landing while RoleGate restores the session and routes by role. */
export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();
  const { profileStatus, profileError, retryProfile } = useSessionStore();

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-paper">
      <BrandMark size="lg" showWordmark subtitle="Restoring your session…" />
      {!isLoaded || (isSignedIn && profileStatus === "loading") ? (
        <ActivityIndicator color={color.ink} />
      ) : null}
      {isSignedIn && profileStatus === "unlinked" ? (
        <>
          <Text className="px-8 text-center text-body text-ink-soft">
            Your account isn’t linked to a society. Ask an admin to invite your
            verified phone or email.
          </Text>
          <Button title="Try again" onPress={retryProfile} />
        </>
      ) : null}
      {isSignedIn && profileStatus === "failed" ? (
        <>
          <Text accessibilityRole="alert" className="px-8 text-center text-body text-ink-soft">
            {profileError ?? "Couldn’t load your profile."}
          </Text>
          <Button title="Try again" onPress={retryProfile} />
        </>
      ) : null}
    </View>
  );
}
