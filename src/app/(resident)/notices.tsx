import { BackControl, Screen } from "@/components/ui";
import { NoticesPanel } from "@/features/notices/NoticesPanel";
import { useNotices } from "@/features/notices/hooks";
import { useRouter } from "expo-router";
import React from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

export default function Notices() {
  const { isRefetching, refetch } = useNotices();
  const router = useRouter();
  const goBack = () =>
    router.canGoBack()
      ? router.back()
      : router.replace("/(resident)/community?tab=notices" as any);

  return (
    <Screen>
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
          />
        }
      >
        <View className="gap-3 p-4">
          <BackControl label="Back to community" onPress={goBack} />
          <Text className="text-display text-ink">Notices</Text>
          <NoticesPanel />
        </View>
      </ScrollView>
    </Screen>
  );
}
