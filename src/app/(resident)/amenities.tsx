import {
  BackControl,
  Chip,
  Screen,
} from "@/components/ui";
import { AmenitiesPanel } from "@/features/community/AmenitiesPanel";
import type { AmenityCategoryFilter } from "@/features/community/amenityCategory";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";

const FILTERS: { key: AmenityCategoryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "indoor", label: "Indoor" },
  { key: "outdoor", label: "Outdoor" },
  { key: "others", label: "Others" },
];

export default function AmenitiesScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<AmenityCategoryFilter>("all");

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
        <Text className="text-display text-ink">Amenities</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
        >
          {FILTERS.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              selected={filter === f.key}
              onPress={() => setFilter(f.key)}
            />
          ))}
        </ScrollView>
      </View>
      <ScrollView className="flex-1">
        <View className="gap-3 p-4 pb-8">
          <AmenitiesPanel categoryFilter={filter} />
        </View>
      </ScrollView>
    </Screen>
  );
}
