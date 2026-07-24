import { Card, Screen, SectionTitle } from "@/components/ui";
import {
  canAdmin,
  type AdminCapability,
  useMyAdminCapabilities,
} from "@/features/admin/capabilities";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

type ManageItem = {
  route: string;
  title: string;
  description: string;
  capability?: AdminCapability;
};

const GROUPS: { title: string; items: ManageItem[] }[] = [
  {
    title: "Society",
    items: [
      {
        route: "towers",
        title: "Towers",
        description: "Building blocks and flat counts",
        capability: "manage_society",
      },
      {
        route: "flats",
        title: "Flats",
        description: "Search, filter, add, and import homes",
        capability: "manage_society",
      },
      {
        route: "members",
        title: "Members",
        description: "Roles and flat assignments",
        capability: "manage_members",
      },
      {
        route: "permissions",
        title: "Admin permissions",
        description: "Granular capability grants for admins",
        capability: "manage_members",
      },
      {
        route: "invitations",
        title: "Invitations",
        description: "Onboarding and invite status",
        capability: "manage_members",
      },
    ],
  },
  {
    title: "Gate & security",
    items: [
      {
        route: "approvals",
        title: "Approvals",
        description: "Gate auto-approval policy",
        capability: "manage_gates",
      },
      {
        route: "gates",
        title: "Gates & guards",
        description: "Gates, shifts, attendance, devices, and smart locks",
        capability: "manage_gates",
      },
      {
        route: "gate-operations",
        title: "Live gate",
        description: "Current arrivals, occupancy, and overrides",
        capability: "manage_gates",
      },
      {
        route: "watchlist",
        title: "Blacklist & watchlist",
        description: "Block or flag visitors at the gate",
        capability: "manage_gates",
      },
      {
        route: "cctv",
        title: "CCTV cameras",
        description: "Register and open gate camera feeds",
        capability: "manage_gates",
      },
    ],
  },
  {
    title: "Community",
    items: [
      {
        route: "amenities",
        title: "Amenities",
        description: "Bookable society facilities",
        capability: "manage_community",
      },
      {
        route: "staff",
        title: "Staff & providers",
        description: "Directory and staff attendance",
        capability: "manage_community",
      },
      {
        route: "polls",
        title: "Polls",
        description: "Create and review society votes",
        capability: "manage_community",
      },
      {
        route: "events",
        title: "Events",
        description: "Calendar events and RSVP capacity",
        capability: "manage_community",
      },
    ],
  },
  {
    title: "Finance & compliance",
    items: [
      {
        route: "insights",
        title: "Insights",
        description: "Traffic, complaints, amenities, dues, polls, guards",
      },
      {
        route: "dues",
        title: "Dues",
        description: "Maintenance charges and claims",
        capability: "manage_dues",
      },
      {
        route: "documents",
        title: "Document vault",
        description: "Bylaws, minutes, and society files",
        capability: "manage_documents",
      },
      {
        route: "audit",
        title: "Audit & exports",
        description: "Immutable administrative activity and exports",
        capability: "view_audit",
      },
    ],
  },
];

export default function ManageHome() {
  const router = useRouter();
  const caps = useMyAdminCapabilities();
  const groups = useMemo(
    () =>
      GROUPS.map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => !item.capability || canAdmin(caps.data, item.capability),
        ),
      })).filter((group) => group.items.length > 0),
    [caps.data],
  );

  return (
    <Screen>
      <ScrollView className="flex-1">
        <View className="gap-4 p-4 pb-10">
          <View className="gap-1">
            <Text accessibilityRole="header" className="text-display text-ink">
              Manage society
            </Text>
            <Text className="text-body text-ink-soft">
              Choose an area. Each list supports focused controls without
              crowding the main tab.
            </Text>
          </View>
          {groups.map((group) => (
            <View key={group.title} className="gap-2">
              <SectionTitle>{group.title}</SectionTitle>
              {group.items.map((section) => (
                <Pressable
                  key={section.route}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${section.title}`}
                  accessibilityHint={section.description}
                  onPress={() =>
                    router.push(
                      `/(admin)/manage/${section.route}` as never,
                    )
                  }
                >
                  <Card>
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1 pr-3">
                        <Text className="text-title text-ink">
                          {section.title}
                        </Text>
                        <Text className="text-caption text-ink-muted">
                          {section.description}
                        </Text>
                      </View>
                      <Text
                        importantForAccessibility="no"
                        className="text-title text-ink-muted"
                      >
                        →
                      </Text>
                    </View>
                  </Card>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
