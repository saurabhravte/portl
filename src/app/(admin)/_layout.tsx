import { RoleGuard } from "@/components/RoleGuard";
import { AppIcon, type AppIconName } from "@/components/ui";
import { useSupabase } from "@/lib/supabase";
import { useThemeColors } from "@/theme/useThemeColors";
import { useQuery } from "@tanstack/react-query";
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

export default function AdminTabs() {
  const colors = useThemeColors();
  const supabase = useSupabase();
  const { data: openTickets = 0 } = useQuery({
    queryKey: ["admin-open-ticket-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress"]);
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });

  return (
    <RoleGuard role="admin">
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
          name="dashboard"
          options={{ title: "Overview", tabBarIcon: icon("home") }}
        />
        <Tabs.Screen
          name="manage"
          options={{
            title: "Manage",
            tabBarAccessibilityLabel: "Manage society",
            tabBarIcon: icon("community"),
            popToTopOnBlur: true,
          }}
        />
        <Tabs.Screen
          name="notices"
          options={{ title: "Notices", tabBarIcon: icon("notices") }}
        />
        <Tabs.Screen
          name="tickets"
          options={{
            title: "Complaints",
            tabBarIcon: icon("complaints"),
            tabBarBadge: openTickets > 0 ? openTickets : undefined,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: "Profile", tabBarIcon: icon("profile") }}
        />
        <Tabs.Screen name="history" options={{ href: null }} />
        <Tabs.Screen name="inbox" options={{ href: null }} />
      </Tabs>
    </RoleGuard>
  );
}
