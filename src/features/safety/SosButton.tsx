import { AppIcon } from "@/components/ui";
import { useRaiseSos } from "@/features/safety/hooks";
import * as Haptics from "expo-haptics";
import React from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";

/**
 * Emergency trigger. Residents raise "sos"; guards raise "panic". Guarded by a
 * confirm dialog so it can't fire by accident, with a haptic on press.
 */
export function SosButton({ kind = "sos" }: { kind?: "sos" | "panic" }) {
  const raise = useRaiseSos();
  const label = kind === "panic" ? "Panic alert" : "Emergency SOS";
  const blurb =
    kind === "panic"
      ? "Instantly alert every guard and admin in the society."
      : "Instantly alert guards, admins and your family.";

  const confirm = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      label,
      `Send an emergency alert now? ${blurb}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send alert",
          style: "destructive",
          onPress: () =>
            raise.mutate(
              { kind },
              {
                onSuccess: () =>
                  Alert.alert(
                    "Alert sent",
                    "Help has been notified. Stay safe — keep your phone with you.",
                  ),
                onError: (e) =>
                  Alert.alert(
                    "Couldn't send",
                    e instanceof Error ? e.message : "Please try again.",
                  ),
              },
            ),
        },
      ],
      { cancelable: true },
    );
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={confirm}
      disabled={raise.isPending}
      className="flex-row items-center gap-3 rounded-lg bg-deny p-4 active:opacity-80"
    >
      <View className="h-11 w-11 items-center justify-center rounded-pill bg-white/20">
        {raise.isPending ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <AppIcon name="shield" size={24} color="#FFFFFF" />
        )}
      </View>
      <View className="flex-1">
        <Text className="text-title text-white">{label}</Text>
        <Text className="text-caption text-white opacity-90">{blurb}</Text>
      </View>
    </Pressable>
  );
}
