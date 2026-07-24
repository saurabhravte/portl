import { RoleGuard } from "@/components/RoleGuard";
import { AppIcon, type AppIconName } from "@/components/ui";
import { useThemeColors } from "@/theme/useThemeColors";
import { Tabs } from "expo-router";

const icon =
  (name: AppIconName) =>
  ({ color: tintColor, focused }: { color: string; focused: boolean }) => (
    <AppIcon name={name} color={tintColor} size={focused ? 26 : 24} />
  );

export default function GuardTabs() {
  const colors = useThemeColors();
  return (
    <RoleGuard role="guard">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.inkFaint,
          tabBarLabelStyle: { fontSize: 13, fontWeight: "600" },
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            height: 68,
            paddingBottom: 10,
          },
        }}
      >
        <Tabs.Screen
          name="gate"
          options={{
            title: "Gate",
            tabBarAccessibilityLabel: "Gate tab",
            tabBarIcon: icon("shield"),
          }}
        />
        <Tabs.Screen
          name="new-visitor"
          options={{
            title: "New visitor",
            tabBarAccessibilityLabel: "New visitor tab",
            tabBarIcon: icon("visitor-add"),
          }}
        />
        <Tabs.Screen
          name="code"
          options={{
            title: "Code",
            tabBarAccessibilityLabel: "Gate code tab",
            tabBarIcon: icon("qr"),
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: "History",
            tabBarAccessibilityLabel: "Visitor history tab",
            tabBarIcon: icon("history"),
          }}
        />
        <Tabs.Screen
          name="shifts"
          options={{
            title: "Shifts",
            tabBarAccessibilityLabel: "Guard shifts tab",
            tabBarIcon: icon("calendar"),
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
        <Tabs.Screen name="inbox" options={{ href: null }} />
        <Tabs.Screen name="queue" options={{ href: null }} />
        <Tabs.Screen name="parcels" options={{ href: null }} />
        <Tabs.Screen name="group-code" options={{ href: null }} />
      </Tabs>
    </RoleGuard>
  );
}
