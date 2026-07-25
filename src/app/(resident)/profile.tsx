import {
  AppIcon,
  Avatar,
  Badge,
  Button,
  Card,
  QueryErrorState,
  Screen,
  Skeleton,
  type AppIconName,
} from "@/components/ui";
import { ContactDetailsSection } from "@/features/auth/ContactDetailsSection";
import {
  useMyFlatSettings,
  useSetAutoApproveOptOut,
} from "@/features/community/hooks";
import { useMyBadges } from "@/features/community/extras";
import { useMyFlatLabel } from "@/features/community/useMyFlatLabel";
import { useSocietyDocuments } from "@/features/documents/hooks";
import { HouseholdPanel } from "@/features/household/HouseholdPanel";
import { PrivacyControls } from "@/features/privacy/PrivacyControls";
import { APP, PROFILE } from "@/lib/copy";
import { checkAndApplyUpdate } from "@/lib/ota";
import { signOutFromPortl } from "@/lib/signOut";
import { useSupabase } from "@/lib/supabase";
import { useSessionStore } from "@/stores/session";
import { useThemeStore, type ThemeMode } from "@/stores/theme";
import { ELEVATION } from "@/theme/tokens";
import { useThemeColors } from "@/theme/useThemeColors";
import { useAuth, useUser } from "@clerk/expo";
import { useRouter } from "expo-router";
import React, { useState } from "react";
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

/**
 * Resident profile — modern card layout (avatar, contact rows, documents,
 * account links) inspired by contemporary society apps.
 */
export default function Profile() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const { profile } = useSessionStore();
  const supabase = useSupabase();
  const router = useRouter();
  const colors = useThemeColors();
  const badges = useMyBadges();
  const { data: flatLabel } = useMyFlatLabel();
  const documents = useSocietyDocuments();
  const [showContactEditor, setShowContactEditor] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null;
  const phone =
    profile?.phone ??
    user?.primaryPhoneNumber?.phoneNumber ??
    user?.phoneNumbers?.[0]?.phoneNumber ??
    null;
  const address = flatLabel ?? PROFILE.notAdded;
  const displayName = profile?.name ?? user?.fullName ?? APP.name;

  const docCards = (documents.data ?? []).slice(0, 8);

  return (
    <Screen>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
          <View className="gap-5 p-4 pb-10">
            {/* Header */}
            <View className="flex-row items-center justify-between">
              <View className="h-10 w-10" />
              <Text className="text-title text-ink">{PROFILE.title}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={PROFILE.openSettings}
                onPress={() => setShowSettings((v) => !v)}
                className="h-10 w-10 items-center justify-center rounded-pill bg-surface-alt active:opacity-70"
              >
                <AppIcon name="settings" size={20} color={colors.ink} />
              </Pressable>
            </View>

            {/* Identity */}
            <View className="items-center gap-3 pt-1">
              <View className="relative">
                <Avatar name={displayName} size={96} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={PROFILE.editProfile}
                  onPress={() => setShowContactEditor(true)}
                  className="absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-pill border border-border bg-surface"
                  style={ELEVATION[1]}
                >
                  <AppIcon name="edit" size={14} color={colors.ink} />
                </Pressable>
              </View>
              <Text className="text-title text-ink">{displayName}</Text>
              {badges.data?.helpful_resident ? (
                <Badge label="Helpful Resident" tone="approve" />
              ) : badges.data && badges.data.kudos_90d > 0 ? (
                <Text className="text-caption text-ink-muted">
                  {badges.data.kudos_90d} thanks in 90 days
                </Text>
              ) : null}
            </View>

            {/* Contact rows */}
            <Card className="gap-0 overflow-hidden p-0">
              <ProfileContactRow
                icon="phone"
                label={PROFILE.phone}
                value={phone ?? PROFILE.notAdded}
                onPress={() => setShowContactEditor(true)}
              />
              <View className="mx-4 h-px bg-border" />
              <ProfileContactRow
                icon="mail"
                label={PROFILE.email}
                value={email ?? PROFILE.notAdded}
                onPress={() => setShowContactEditor(true)}
              />
              <View className="mx-4 h-px bg-border" />
              <ProfileContactRow
                icon="location"
                label={PROFILE.address}
                value={address}
                onPress={() => router.push("/(resident)/directory" as never)}
              />
            </Card>

            {showContactEditor ? (
              <View className="gap-2">
                <ContactDetailsSection />
                <Button
                  title={PROFILE.cancel}
                  variant="ghost"
                  onPress={() => setShowContactEditor(false)}
                />
              </View>
            ) : null}

            {/* My documents */}
            <View className="gap-3">
              <Pressable
                accessibilityRole="button"
                className="flex-row items-center gap-1 active:opacity-70"
                onPress={() => router.push("/(resident)/community" as never)}
              >
                <Text className="text-title text-ink">{PROFILE.myDocuments}</Text>
                <AppIcon name="next" size={18} color={colors.inkMuted} />
              </Pressable>
              {documents.isLoading ? <Skeleton height={120} /> : null}
              {documents.isError ? (
                <QueryErrorState
                  error={documents.error}
                  onRetry={() => void documents.refetch()}
                  isRetrying={documents.isRefetching}
                />
              ) : null}
              {!documents.isLoading && !docCards.length ? (
                <Card>
                  <Text className="text-body text-ink-muted">
                    Society documents will appear here when shared.
                  </Text>
                </Card>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerClassName="gap-3"
                >
                  {docCards.map((doc) => (
                    <View
                      key={doc.id}
                      className="w-36 gap-3 rounded-xl border border-border bg-surface p-4"
                      style={ELEVATION[1]}
                    >
                      <View className="h-10 w-10 items-center justify-center rounded-md bg-info-soft">
                        <AppIcon
                          name="document"
                          size={20}
                          color={colors.info}
                        />
                      </View>
                      <Text className="text-label text-ink" numberOfLines={2}>
                        {doc.title}
                      </Text>
                      <Text
                        className="text-caption text-ink-muted"
                        numberOfLines={1}
                      >
                        {doc.category}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* Account & billing */}
            <View className="gap-3">
              <Text className="text-title text-ink">
                {PROFILE.bankingDocuments}
              </Text>
              <Card className="gap-0 overflow-hidden p-0">
                <ProfileLinkRow
                  icon="invoice"
                  label={PROFILE.statements}
                  onPress={() => router.push("/(resident)/payments" as never)}
                />
                <View className="mx-4 h-px bg-border" />
                <ProfileLinkRow
                  icon="payments"
                  label={PROFILE.claims}
                  onPress={() => router.push("/(resident)/payments" as never)}
                />
              </Card>
            </View>

            {/* Expanded settings (gear) */}
            {showSettings ? (
              <View className="gap-4">
                <AppearanceSettings />
                {profile?.flat_id ? <AutoApprovePrefs /> : null}
                {profile?.flat_id ? <HouseholdPanel /> : null}
                <PrivacyControls
                  onDeletionRequested={() =>
                    signOutFromPortl(supabase, signOut)
                  }
                />
                <Card className="gap-0 overflow-hidden p-0">
                  <ProfileLinkRow
                    icon="inbox"
                    label="Inbox"
                    onPress={() => router.push("/(resident)/inbox" as never)}
                  />
                  <View className="mx-4 h-px bg-border" />
                  <ProfileLinkRow
                    icon="history"
                    label="Visitor history"
                    onPress={() => router.push("/(resident)/history" as never)}
                  />
                  {profile?.flat_id ? (
                    <>
                      <View className="mx-4 h-px bg-border" />
                      <ProfileLinkRow
                        icon="person"
                        label="Domestic help"
                        onPress={() =>
                          router.push("/(resident)/domestic" as never)
                        }
                      />
                      <View className="mx-4 h-px bg-border" />
                      <ProfileLinkRow
                        icon="delivery"
                        label="Packages"
                        onPress={() =>
                          router.push("/(resident)/parcels" as never)
                        }
                      />
                      <View className="mx-4 h-px bg-border" />
                      <ProfileLinkRow
                        icon="cab"
                        label="My vehicles"
                        onPress={() =>
                          router.push("/(resident)/vehicles" as never)
                        }
                      />
                      <View className="mx-4 h-px bg-border" />
                      <ProfileLinkRow
                        icon="shield"
                        label="Security on duty"
                        onPress={() =>
                          router.push("/(resident)/security" as never)
                        }
                      />
                    </>
                  ) : null}
                </Card>
                <Button
                  title="Check for app updates"
                  variant="ghost"
                  onPress={() => checkAndApplyUpdate({ silent: false })}
                />
              </View>
            ) : null}

            <Button
              title={PROFILE.signOut}
              variant="secondary"
              onPress={() =>
                Alert.alert(PROFILE.signOut, PROFILE.signOutConfirm, [
                  { text: PROFILE.cancel, style: "cancel" },
                  {
                    text: PROFILE.signOut,
                    style: "destructive",
                    onPress: async () => {
                      try {
                        await signOutFromPortl(supabase, signOut);
                      } catch (error) {
                        Alert.alert(
                          "Couldn't sign out",
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
            <Text className="text-center text-caption text-ink-muted">
              {APP.name} · {APP.tagline}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function ProfileContactRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: AppIconName;
  label: string;
  value: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-3 px-4 py-3.5 active:opacity-70"
    >
      <View className="h-10 w-10 items-center justify-center rounded-md bg-surface-alt">
        <AppIcon name={icon} size={18} color={colors.ink} />
      </View>
      <View className="flex-1">
        <Text className="text-caption text-ink-muted">{label}</Text>
        <Text className="text-body text-ink" numberOfLines={1}>
          {value}
        </Text>
      </View>
      <AppIcon name="next" size={18} color={colors.inkFaint} />
    </Pressable>
  );
}

function ProfileLinkRow({
  icon,
  label,
  onPress,
}: {
  icon: AppIconName;
  label: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-3 px-4 py-3.5 active:opacity-70"
    >
      <View className="h-10 w-10 items-center justify-center rounded-md bg-surface-alt">
        <AppIcon name={icon} size={18} color={colors.ink} />
      </View>
      <Text className="flex-1 text-body text-ink">{label}</Text>
      <AppIcon name="next" size={18} color={colors.inkFaint} />
    </Pressable>
  );
}

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
      onError: (e: { message?: string }) =>
        Alert.alert("Could not save", e.message ?? "Try again."),
    });
  };

  return (
    <Card>
      <Text className="text-label text-ink">Ask me every time</Text>
      {settingsQuery.isLoading ? <Skeleton height={48} /> : null}
      {settingsQuery.isError ? (
        <QueryErrorState
          error={settingsQuery.error}
          onRetry={() => void settingsQuery.refetch()}
          isRetrying={settingsQuery.isRefetching}
          title="Couldn't load approval settings"
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
                accessibilityState={{
                  checked: on,
                  disabled: setOptOut.isPending,
                }}
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

function AppearanceSettings() {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const colors = useThemeColors();

  const options: {
    value: ThemeMode;
    label: string;
    icon: "sun" | "moon" | "settings";
  }[] = [
    { value: "light", label: "Light", icon: "sun" },
    { value: "dark", label: "Dark", icon: "moon" },
    { value: "system", label: "System", icon: "settings" },
  ];

  return (
    <Card>
      <View className="flex-row items-center gap-2">
        <AppIcon name="theme" size={20} color={colors.accent} />
        <Text className="text-label text-ink">{PROFILE.appearance}</Text>
      </View>
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
              className={`flex-1 items-center gap-1.5 rounded-lg border px-3 py-3 ${
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
                  selected ? "text-primary-text" : "text-ink-soft"
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
