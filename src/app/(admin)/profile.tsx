import {
  AppIcon,
  Avatar,
  Button,
  Card,
  Screen,
  type AppIconName,
} from "@/components/ui";
import { ContactDetailsSection } from "@/features/auth/ContactDetailsSection";
import { PrivacyControls } from "@/features/privacy/PrivacyControls";
import { APP, PROFILE } from "@/lib/copy";
import { checkAndApplyUpdate } from "@/lib/ota";
import { signOutFromPortl } from "@/lib/signOut";
import { useSupabase } from "@/lib/supabase";
import { useSessionStore } from "@/stores/session";
import { ELEVATION } from "@/theme/tokens";
import { useThemeColors } from "@/theme/useThemeColors";
import { useAuth, useUser } from "@clerk/expo";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

export default function Profile() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const { profile } = useSessionStore();
  const supabase = useSupabase();
  const router = useRouter();
  const colors = useThemeColors();
  const [showContact, setShowContact] = useState(false);

  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null;
  const phone = profile?.phone ?? user?.primaryPhoneNumber?.phoneNumber ?? null;
  const displayName = profile?.name ?? user?.fullName ?? "Admin";

  return (
    <Screen>
      <ScrollView
        contentContainerClassName="gap-5 p-4 pb-10"
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center justify-between">
          <View className="h-10 w-10" />
          <Text className="text-title text-ink">{PROFILE.title}</Text>
          <View className="h-10 w-10" />
        </View>

        <View className="items-center gap-3">
          <View className="relative">
            <Avatar name={displayName} size={96} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={PROFILE.editProfile}
              onPress={() => setShowContact(true)}
              className="absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-pill border border-border bg-surface"
              style={ELEVATION[1]}
            >
              <AppIcon name="edit" size={14} color={colors.ink} />
            </Pressable>
          </View>
          <Text className="text-title text-ink">{displayName}</Text>
          <Text className="text-caption text-ink-muted">Society admin</Text>
        </View>

        <Card className="gap-0 overflow-hidden p-0">
          <AdminRow
            icon="phone"
            label={PROFILE.phone}
            value={phone ?? PROFILE.notAdded}
            onPress={() => setShowContact(true)}
          />
          <View className="mx-4 h-px bg-border" />
          <AdminRow
            icon="mail"
            label={PROFILE.email}
            value={email ?? PROFILE.notAdded}
            onPress={() => setShowContact(true)}
          />
        </Card>

        {showContact ? (
          <View className="gap-2">
            <ContactDetailsSection />
            <Button
              title={PROFILE.cancel}
              variant="ghost"
              onPress={() => setShowContact(false)}
            />
          </View>
        ) : null}

        <Card className="gap-0 overflow-hidden p-0">
          <AdminLink
            icon="inbox"
            label="Inbox"
            onPress={() => router.push("/(admin)/inbox" as never)}
          />
          <View className="mx-4 h-px bg-border" />
          <AdminLink
            icon="history"
            label="Visitor history"
            onPress={() => router.push("/(admin)/history" as never)}
          />
          <View className="mx-4 h-px bg-border" />
          <AdminLink
            icon="notices"
            label={PROFILE.myDocuments}
            onPress={() => router.push("/(admin)/manage/documents" as never)}
          />
        </Card>

        <Button
          title="Check for app updates"
          variant="ghost"
          onPress={() => checkAndApplyUpdate({ silent: false })}
        />
        <PrivacyControls
          onDeletionRequested={() => signOutFromPortl(supabase, signOut)}
        />
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
          {APP.name} · Manage your society from one place.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function AdminRow({
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

function AdminLink({
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
