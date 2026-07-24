import { useSessionStore, type Role } from "@/stores/session";
import { Redirect } from "expo-router";
import React from "react";

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

  // Profile not loaded yet — root RoleGate handles the signed-out case.
  if (!profile) return null;

  if (profile.role !== role) {
    return <Redirect href={HOME[profile.role] as any} />;
  }

  return <>{children}</>;
}
