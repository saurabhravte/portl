import { Button, Card, Screen } from "@/components/ui";
import Constants from "expo-constants";
import React from "react";
import { Linking, Text, View } from "react-native";

/** True when the three public backend keys are present. */
export function hasBackendConfig() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const clerk = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  return Boolean(url && anon && clerk);
}

/**
 * Shown instead of Clerk/Supabase when .env is empty.
 * Prevents a hard crash on first local run.
 */
export function MissingConfigScreen() {
  return (
    <Screen className="justify-center gap-4 p-6">
      <Text className="text-display text-ink">Setup needed</Text>
      <Text className="text-body text-ink-soft">
        Portl needs Clerk and Supabase keys in your local{" "}
        <Text className="text-label text-ink">.env</Text> file before it can run.
      </Text>
      <Card className="gap-2">
        <Text className="text-label text-ink">1. Open .env in the project root</Text>
        <Text className="text-caption text-ink-muted">
          EXPO_PUBLIC_SUPABASE_URL={"\n"}
          EXPO_PUBLIC_SUPABASE_ANON_KEY={"\n"}
          EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=
        </Text>
        <Text className="text-label text-ink">2. Restart Expo after saving</Text>
        <Text className="text-caption text-ink-muted">
          Stop the server, then run: bun start
        </Text>
        <Text className="text-label text-ink">3. Run Supabase migrations + seed</Text>
        <Text className="text-caption text-ink-muted">
          See README.md — apply migrations 0001–0023, then the identity-free seed
        </Text>
      </Card>
      <View className="flex-row flex-wrap gap-3">
        <Button
          title="Clerk dashboard"
          variant="secondary"
          onPress={() => Linking.openURL("https://dashboard.clerk.com")}
        />
        <Button
          title="Supabase dashboard"
          variant="secondary"
          onPress={() => Linking.openURL("https://supabase.com/dashboard")}
        />
      </View>
      <Text className="text-caption text-ink-muted">
        App: {Constants.expoConfig?.name ?? "portl"} · fill keys then reload
      </Text>
    </Screen>
  );
}
