import { RoleGuard } from "@/components/RoleGuard";
import { AppIcon, type AppIconName } from "@/components/ui";
import { useFlatApprovals } from "@/features/visitors/hooks";
import { useThemeColors } from "@/theme/useThemeColors";
import { Tabs } from "expo-router";

const icon =
  (name: AppIconName) =>
  ({ color: tintColor, focused }: { color: string; focused: boolean }) => (
    <AppIcon
      name={name}
      color={tintColor}
      size={focused ? 25 : 23}
      strokeWidth={focused ? 2.1 : 1.8}
    />
  );

export default function ResidentTabs() {
  const colors = useThemeColors();
  const { data: pending } = useFlatApprovals();
  const pendingCount = pending?.length ?? 0;

  return (
    <RoleGuard role="resident">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.inkFaint,
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            height: 62,
            paddingBottom: 8,
          },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: "Home",
            tabBarAccessibilityLabel: "Home tab",
            tabBarIcon: icon("home"),
          }}
        />
        <Tabs.Screen
          name="pre-approvals"
          options={{
            title: "Visitors",
            tabBarAccessibilityLabel: "Visitors tab",
            tabBarIcon: icon("visitors"),
            tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
          }}
        />
        <Tabs.Screen
          name="community"
          options={{
            title: "Community",
            tabBarAccessibilityLabel: "Community tab",
            tabBarIcon: icon("community"),
          }}
        />
        <Tabs.Screen
          name="payments"
          options={{
            title: "Payments",
            tabBarAccessibilityLabel: "Payments tab",
            tabBarIcon: icon("payments"),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarAccessibilityLabel: "Profile tab",
            tabBarIcon: icon("profile"),
          }}
        />
        <Tabs.Screen name="helpdesk" options={{ href: null }} />
        <Tabs.Screen name="notices" options={{ href: null }} />
        <Tabs.Screen name="history" options={{ href: null }} />
        <Tabs.Screen name="inbox" options={{ href: null }} />
        <Tabs.Screen name="approve" options={{ href: null }} />
        <Tabs.Screen name="amenities" options={{ href: null }} />
        <Tabs.Screen name="directory" options={{ href: null }} />
        <Tabs.Screen name="security" options={{ href: null }} />
        <Tabs.Screen name="vehicles" options={{ href: null }} />
        <Tabs.Screen name="parcels" options={{ href: null }} />
        <Tabs.Screen name="recurring" options={{ href: null }} />
        <Tabs.Screen name="favorites" options={{ href: null }} />
        <Tabs.Screen name="group-pass" options={{ href: null }} />
      </Tabs>
    </RoleGuard>
  );
}
