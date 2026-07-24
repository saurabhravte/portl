import { BrandMark } from "@/components/BrandMark";
import { Button, Card, Screen, SectionTitle } from "@/components/ui";
import { PrivacyControls } from "@/features/privacy/PrivacyControls";
import { usePrefs, useT, type Lang } from "@/lib/i18n";
import { checkAndApplyUpdate } from "@/lib/ota";
import { signOutFromPortl } from "@/lib/signOut";
import { useSupabase } from "@/lib/supabase";
import { useSessionStore } from "@/stores/session";
import { useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import React from "react";
import { Alert, Pressable, ScrollView, Switch, Text, View } from "react-native";

export default function Profile() {
  const t = useT();
  const { signOut } = useAuth();
  const { profile } = useSessionStore();
  const supabase = useSupabase();
  const { lang, setLang, trainingMode, setTrainingMode } = usePrefs();
  const router = useRouter();

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 p-4 pb-10">
      <BrandMark size="sm" />
      <Text className="text-display text-ink">Profile</Text>
      <Card>
        <Text className="text-title text-ink">{profile?.name}</Text>
        <Text className="text-body text-ink-soft">Role: Security guard</Text>
        {profile?.phone ? (
          <Text className="text-body text-ink-soft">Phone: {profile.phone}</Text>
        ) : null}
      </Card>

      <Card>
        <SectionTitle>{t("language")}</SectionTitle>
        <View className="flex-row gap-2">
          {(["en", "hi"] as Lang[]).map((l) => (
            <Pressable
              key={l}
              accessibilityRole="radio"
              accessibilityLabel={l === "en" ? "English" : "Hindi"}
              accessibilityState={{ checked: lang === l }}
              onPress={() => setLang(l)}
              className={`grow items-center rounded-md px-4 py-3 ${lang === l ? "bg-ink" : "bg-surface-alt"}`}
            >
              <Text
                className={`text-label ${lang === l ? "text-inverse" : "text-ink-soft"}`}
              >
                {l === "en" ? "English" : "हिन्दी"}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card>
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-label text-ink">{t("training_mode")}</Text>
            <Text className="text-caption text-ink-muted">
              {t("training_mode_hint")}
            </Text>
          </View>
          <Switch
            accessibilityLabel={t("training_mode")}
            accessibilityState={{ checked: trainingMode }}
            value={trainingMode}
            onValueChange={setTrainingMode}
          />
        </View>
      </Card>

      <Button
        title="Inbox"
        variant="secondary"
        onPress={() => router.push("/(guard)/inbox" as any)}
      />
      <SectionTitle>Gate tools</SectionTitle>
      <Button
        title="Log a package"
        variant="ghost"
        onPress={() => router.push("/(guard)/parcels" as any)}
      />
      <Button
        title="Group / event code"
        variant="ghost"
        onPress={() => router.push("/(guard)/group-code" as any)}
      />
      <Button
        title={t("check_updates")}
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
        Portl · Gate ops. Keep requests short and clear.
      </Text>
      </ScrollView>
    </Screen>
  );
}
