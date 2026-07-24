import { BrandMark } from "@/components/BrandMark";
import { Button, Card, Screen } from "@/components/ui";
import { PrivacyControls } from "@/features/privacy/PrivacyControls";
import { checkAndApplyUpdate } from "@/lib/ota";
import { signOutFromPortl } from "@/lib/signOut";
import { useSupabase } from "@/lib/supabase";
import { useSessionStore } from "@/stores/session";
import { useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import React from "react";
import { Alert, ScrollView, Text, View } from "react-native";

export default function Profile() {
  const { signOut } = useAuth();
  const { profile } = useSessionStore();
  const supabase = useSupabase();
  const router = useRouter();
  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 p-4 pb-10">
      <BrandMark size="sm" />
      <Text className="text-display text-ink">Profile</Text>
      <Card>
        <Text className="text-title text-ink">{profile?.name}</Text>
        <Text className="text-body text-ink-soft">Role: Society admin</Text>
        {profile?.phone ? (
          <Text className="text-body text-ink-soft">Phone: {profile.phone}</Text>
        ) : null}
      </Card>
      <Button
        title="Inbox"
        variant="secondary"
        onPress={() => router.push("/(admin)/inbox" as any)}
      />
      <Button
        title="Visitor history"
        variant="ghost"
        onPress={() => router.push("/(admin)/history" as any)}
      />
      <Button
        title="Check for app updates"
        variant="ghost"
        onPress={() => checkAndApplyUpdate({ silent: false })}
      />
      <PrivacyControls onDeletionRequested={() => signOutFromPortl(supabase, signOut)} />
      <Button
        title="Sign out"
        variant="secondary"
        onPress={() =>
          Alert.alert("Sign out?", "You’ll need to sign in again to use Portl.", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Sign out",
              style: "destructive",
              onPress: async () => {
                try {
                  await signOutFromPortl(supabase, signOut);
                } catch (error) {
                  Alert.alert(
                    "Couldn’t sign out",
                    error instanceof Error
                      ? error.message
                      : "Check your connection and try again.",
                  );
                }
              },
            },
          ])
        }
      />
      <View className="h-4" />
      <Text className="text-caption text-ink-muted">
        Portl · Manage your society from one place.
      </Text>
      </ScrollView>
    </Screen>
  );
}
