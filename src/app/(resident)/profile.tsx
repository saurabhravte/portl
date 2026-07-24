import {
  AppIcon,
  Avatar,
  Badge,
  Button,
  Card,
  QueryErrorState,
  Screen,
  SectionTitle,
  Skeleton,
} from "@/components/ui";
import { useThemeStore, type ThemeMode } from "@/stores/theme";
import { useThemeColors } from "@/theme/useThemeColors";
import {
  useMyFlatSettings,
  useSetAutoApproveOptOut,
} from "@/features/community/hooks";
import { useMyBadges } from "@/features/community/extras";
import { HouseholdPanel } from "@/features/household/HouseholdPanel";
import { PrivacyControls } from "@/features/privacy/PrivacyControls";
import { ResidentIdCard } from "@/features/residentId/ResidentIdCard";
import { checkAndApplyUpdate } from "@/lib/ota";
import { signOutFromPortl } from "@/lib/signOut";
import { useSupabase } from "@/lib/supabase";
import { useSessionStore } from "@/stores/session";
import { useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import React from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

const VISITOR_TYPES = ["guest", "delivery", "cab", "service"] as const;

export default function Profile() {
  const { signOut } = useAuth();
  const { profile } = useSessionStore();
  const supabase = useSupabase();
  const router = useRouter();
  const badges = useMyBadges();

  return (
    <Screen>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="gap-4 p-4 pb-8">
          <Text className="text-display text-ink">Profile</Text>
          <Card>
            <View className="flex-row items-center gap-3">
              <Avatar name={profile?.name} size={52} />
              <View className="flex-1">
                <Text className="text-title text-ink">{profile?.name}</Text>
                <Text className="text-caption text-ink-muted capitalize">
                  {profile?.role}
                  {profile?.phone ? ` · ${profile.phone}` : ""}
                </Text>
                {badges.data?.helpful_resident ? (
                  <View className="mt-1 self-start">
                    <Badge label="Helpful Resident" tone="approve" />
                  </View>
                ) : badges.data && badges.data.kudos_90d > 0 ? (
                  <Text className="mt-1 text-caption text-ink-muted">
                    {badges.data.kudos_90d} thanks in 90 days
                  </Text>
                ) : null}
              </View>
            </View>
          </Card>

          {profile?.role === "resident" && profile?.flat_id ? (
            <ResidentIdCard />
          ) : null}

          <AppearanceSettings />

          {profile?.flat_id ? <AutoApprovePrefs /> : null}
          {profile?.flat_id ? <HouseholdPanel /> : null}
          <PrivacyControls onDeletionRequested={() => signOutFromPortl(supabase, signOut)} />

          <Button
            title="Inbox"
            variant="secondary"
            onPress={() => router.push("/(resident)/inbox" as any)}
          />
          {profile?.flat_id ? (
            <>
              <SectionTitle>Passes & entry</SectionTitle>
              <Button title="Domestic help" variant="ghost" onPress={() => router.push("/(resident)/domestic" as any)} />
              <Button title="Group & event passes" variant="ghost" onPress={() => router.push("/(resident)/group-pass" as any)} />
              <Button title="Recurring passes" variant="ghost" onPress={() => router.push("/(resident)/recurring" as any)} />
              <Button title="Favorite visitors" variant="ghost" onPress={() => router.push("/(resident)/favorites" as any)} />
              <Button title="My vehicles" variant="ghost" onPress={() => router.push("/(resident)/vehicles" as any)} />
              <Button title="Packages" variant="ghost" onPress={() => router.push("/(resident)/parcels" as any)} />
              <Button title="Security on duty" variant="ghost" onPress={() => router.push("/(resident)/security" as any)} />
            </>
          ) : null}
          <Button
            title="Visitor history"
            variant="ghost"
            onPress={() => router.push("/(resident)/history" as any)}
          />
          <Button
            title="Check for app updates"
            variant="ghost"
            onPress={() => checkAndApplyUpdate({ silent: false })}
          />
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
          <Text className="text-caption text-ink-muted">
            Portl · The society gate, in your pocket.
          </Text>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** Per-flat opt-out from society auto-approval (ticket #18). */
function AutoApprovePrefs() {
  const settingsQuery = useMyFlatSettings();
  const settings = settingsQuery.data;
  const setOptOut = useSetAutoApproveOptOut();
  const optedOut = settings?.noAutoApproveTypes ?? [];

  const toggle = (type: string) => {
    const next = optedOut.includes(type)
      ? optedOut.filter((t) => t !== type)
      : [...optedOut, type];
    setOptOut.mutate(next, {
      onError: (e: any) => Alert.alert("Could not save", e.message),
    });
  };

  return (
    <Card>
      <SectionTitle>Ask me every time</SectionTitle>
      {settingsQuery.isLoading ? <Skeleton height={48} /> : null}
      {settingsQuery.isError ? (
        <QueryErrorState
          error={settingsQuery.error}
          onRetry={() => void settingsQuery.refetch()}
          isRetrying={settingsQuery.isRefetching}
          title="Couldn’t load approval settings"
        />
      ) : null}
      <Text className="text-caption text-ink-muted">
        Even if your society auto-approves these visitor types, you can insist
        on approving them yourself for your flat.
      </Text>
      {!settingsQuery.isLoading && !settingsQuery.isError ? (
      <View className="flex-row flex-wrap gap-2">
        {VISITOR_TYPES.map((t) => {
          const on = optedOut.includes(t);
          return (
            <Pressable
              key={t}
              accessibilityRole="switch"
              accessibilityLabel={`Ask me every time for ${t} visitors`}
              accessibilityState={{ checked: on, disabled: setOptOut.isPending }}
              onPress={() => toggle(t)}
              className={`rounded-pill px-3 py-2 ${on ? "bg-ink" : "bg-surface-alt"}`}
            >
              <Text
                className={`text-caption capitalize ${on ? "text-inverse" : "text-ink-soft"}`}
              >
                {on ? "✓ " : ""}
                {t}
              </Text>
            </Pressable>
          );
        })}
      </View>
      ) : null}
    </Card>
  );
}

/** Settings → Appearance: Light / Dark / System theme switch (mockup). */
function AppearanceSettings() {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const colors = useThemeColors();

  const options: { value: ThemeMode; label: string; icon: "sun" | "moon" | "settings" }[] = [
    { value: "light", label: "Light", icon: "sun" },
    { value: "dark", label: "Dark", icon: "moon" },
    { value: "system", label: "System", icon: "settings" },
  ];

  return (
    <Card>
      <View className="flex-row items-center gap-2">
        <AppIcon name="theme" size={20} color={colors.primary} />
        <Text className="text-label text-ink">Appearance</Text>
      </View>
      <Text className="text-caption text-ink-muted">
        Easy on the eyes. Built for comfortable usage.
      </Text>
      <View className="mt-1 flex-row gap-2">
        {options.map((opt) => {
          const selected = mode === opt.value;
          return (
            <Pressable
              key={opt.value}
              accessibilityRole="button"
              accessibilityLabel={`${opt.label} theme`}
              accessibilityState={{ selected }}
              onPress={() => setMode(opt.value)}
              className={`flex-1 items-center gap-1.5 rounded-md border px-3 py-3 ${
                selected
                  ? "border-primary bg-primary-soft"
                  : "border-border bg-surface-alt"
              } active:opacity-80`}
            >
              <AppIcon
                name={opt.icon}
                size={20}
                color={selected ? colors.primary : colors.inkMuted}
              />
              <Text
                className={`text-caption font-semibold ${
                  selected ? "text-primary" : "text-ink-soft"
                }`}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}
