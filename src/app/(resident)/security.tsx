import { BackControl, Screen, SectionTitle } from "@/components/ui";
import { GuardsOnDutyPanel } from "@/features/guards/GuardsOnDutyPanel";
import { useGuardsOnDuty } from "@/features/guards/hooks";
import { useRouter } from "expo-router";
import React from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

export default function ResidentSecurity() {
  const router = useRouter();
  const { isRefetching, refetch } = useGuardsOnDuty();

  return (
    <Screen>
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-8"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
          />
        }
      >
        <BackControl onPress={() => router.back()} />
        <View>
          <Text className="text-display text-ink">Security</Text>
          <Text className="text-body text-ink-soft">
            Guards currently on shift at your society's gates.
          </Text>
        </View>
        <SectionTitle>On duty</SectionTitle>
        <GuardsOnDutyPanel />
      </ScrollView>
    </Screen>
  );
}
