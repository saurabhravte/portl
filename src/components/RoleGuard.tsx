import { LoadingState } from "@/components/states";
import { useSessionStore, type Role } from "@/stores/session";
import { Redirect } from "expo-router";
import React from "react";
import { View } from "react-native";

const HOME: Record<Role, string> = {
  resident: "/(resident)/home",
  guard: "/(guard)/gate",
  admin: "/(admin)/dashboard",
};

/**
 * Route-level guard: wraps a (role) tab navigator and redirects anyone
 * whose profile role doesn't match. DB RLS already protects the data;
 * this closes the deep-link hole in the UI layer.
 */
export function RoleGuard({
  role,
  children,
}: {
  role: Role;
  children: React.ReactNode;
}) {
  const profile = useSessionStore((s) => s.profile);
  const profileStatus = useSessionStore((s) => s.profileStatus);

  // Profile not loaded yet — show spinner instead of a blank screen on cold start.
  if (!profile) {
    if (profileStatus === "loading") {
      return (
        <View className="flex-1 items-center justify-center bg-canvas">
          <LoadingState message="Loading your society…" />
        </View>
      );
    }
    // Root RoleGate handles signed-out / unlinked / failed; stay quiet here.
    return null;
  }

  if (profile.role !== role) {
    return <Redirect href={HOME[profile.role] as any} />;
  }

  return <>{children}</>;
}
