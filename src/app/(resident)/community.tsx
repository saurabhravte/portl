import { Chip, Screen, SectionTitle } from "@/components/ui";
import { CarpoolPanel } from "@/features/carpool/CarpoolPanel";
import { AmenitiesPanel } from "@/features/community/AmenitiesPanel";
import type { AmenityCategoryFilter } from "@/features/community/amenityCategory";
import { DirectoryPanel } from "@/features/community/DirectoryPanel";
import { PollsPanel } from "@/features/community/PollsPanel";
import { EventsPanel } from "@/features/events/EventsPanel";
import { FeedPanel } from "@/features/feed/FeedPanel";
import { LostFoundPanel } from "@/features/lostFound/LostFoundPanel";
import { MarketplacePanel } from "@/features/marketplace/MarketplacePanel";
import { NoticesPanel } from "@/features/notices/NoticesPanel";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";

type Tab =
  | "feed"
  | "notices"
  | "amenities"
  | "polls"
  | "staff"
  | "lost"
  | "market"
  | "rides"
  | "events";

const AMENITY_FILTERS: { key: AmenityCategoryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "indoor", label: "Indoor" },
  { key: "outdoor", label: "Outdoor" },
  { key: "others", label: "Others" },
];

const TABS: { key: Tab; label: string }[] = [
  { key: "feed", label: "Feed" },
  { key: "polls", label: "Polls" },
  { key: "notices", label: "Notices" },
  { key: "events", label: "Events" },
  { key: "lost", label: "Lost & Found" },
  { key: "market", label: "Market" },
  { key: "rides", label: "Rides" },
  { key: "amenities", label: "Amenities" },
  { key: "staff", label: "Directory" },
];

function parseTab(value: string | string[] | undefined): Tab {
  const raw = Array.isArray(value) ? value[0] : value;
  if (TABS.some((t) => t.key === raw)) return raw as Tab;
  if (raw === "directory") return "staff";
  return "feed";
}

export default function Community() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(() => parseTab(params.tab));
  const [amenityFilter, setAmenityFilter] =
    useState<AmenityCategoryFilter>("all");
  const router = useRouter();

  useEffect(() => {
    setTab(parseTab(params.tab));
  }, [params.tab]);

  const selectTab = (next: Tab) => {
    setTab(next);
    router.setParams({ tab: next });
  };

  return (
    <Screen className="gap-3 p-4">
      <SectionTitle>Community</SectionTitle>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
      >
        {TABS.map((t) => (
          <Chip
            key={t.key}
            label={t.label}
            selected={tab === t.key}
            onPress={() => selectTab(t.key)}
          />
        ))}
      </ScrollView>
      {tab === "amenities" ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
        >
          {AMENITY_FILTERS.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              selected={amenityFilter === f.key}
              onPress={() => setAmenityFilter(f.key)}
            />
          ))}
        </ScrollView>
      ) : null}
      <ScrollView className="flex-1">
        <View className="gap-3 pb-8">
          {tab === "feed" ? <FeedPanel /> : null}
          {tab === "polls" ? <PollsPanel /> : null}
          {tab === "notices" ? <NoticesPanel /> : null}
          {tab === "events" ? <EventsPanel /> : null}
          {tab === "lost" ? <LostFoundPanel /> : null}
          {tab === "market" ? <MarketplacePanel /> : null}
          {tab === "rides" ? <CarpoolPanel /> : null}
          {tab === "amenities" ? (
            <AmenitiesPanel categoryFilter={amenityFilter} />
          ) : null}
          {tab === "staff" ? <DirectoryPanel /> : null}
        </View>
      </ScrollView>
    </Screen>
  );
}
