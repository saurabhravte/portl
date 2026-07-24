import { BackControl, Screen } from "@/components/ui";
import { DirectoryPanel } from "@/features/community/DirectoryPanel";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text, View } from "react-native";

export default function DirectoryScreen() {
  const router = useRouter();

  return (
    <Screen>
      <View className="gap-3 px-4 pt-4">
        <BackControl
          label="Back"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/(resident)/home" as any);
          }}
        />
        <Text className="text-display text-ink">Directory</Text>
        <Text className="text-body text-ink-soft">
          Society staff and verified service providers.
        </Text>
      </View>
      <ScrollView className="flex-1">
        <View className="gap-3 p-4 pb-8">
          <DirectoryPanel />
        </View>
      </ScrollView>
    </Screen>
  );
}
