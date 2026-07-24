import { useSupabase } from "@/lib/supabase";
import {
  adminCapabilitySchema,
  parseInput,
  setAdminCapabilitiesSchema,
} from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

export const ADMIN_CAPABILITIES = [
  "manage_society",
  "manage_members",
  "manage_gates",
  "manage_community",
  "manage_dues",
  "manage_documents",
  "view_audit",
] as const;

export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number];

export const CAPABILITY_LABELS: Record<AdminCapability, string> = {
  manage_society: "Towers & flats",
  manage_members: "Members & invites",
  manage_gates: "Gates & security",
  manage_community: "Community & staff",
  manage_dues: "Dues & late fees",
  manage_documents: "Document vault",
  view_audit: "Audit & exports",
};

export function useMyAdminCapabilities() {
  const supabase = useSupabase();
  const role = useSessionStore((s) => s.profile?.role);
  return useQuery({
    queryKey: ["my-admin-capabilities"],
    enabled: role === "admin",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_admin_capabilities");
      if (error) throw error;
      const caps = (data as unknown as string[]) ?? [];
      if (caps.includes("*")) return { full: true as const, caps: [...ADMIN_CAPABILITIES] };
      const parsed = z.array(adminCapabilitySchema).parse(caps);
      return { full: false as const, caps: parsed };
    },
  });
}

export function canAdmin(
  caps: { full: boolean; caps: AdminCapability[] } | undefined,
  needed: AdminCapability,
): boolean {
  if (!caps) return true; // optimistic while loading (screens still RLS-gated)
  return caps.full || caps.caps.includes(needed);
}

export type AdminCapabilityGrant = {
  profile_id: string;
  name: string;
  capabilities: string[];
};

export function useAdminCapabilityGrants() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["admin-capability-grants"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_admin_capability_grants");
      if (error) throw error;
      return (data as unknown as AdminCapabilityGrant[]) ?? [];
    },
  });
}

export function useSetAdminCapabilities() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      profileId: string;
      capabilities: AdminCapability[];
    }) => {
      const parsed = parseInput(setAdminCapabilitiesSchema, input);
      const { error } = await supabase.rpc("set_admin_capabilities", {
        p_profile_id: parsed.profileId,
        p_capabilities: parsed.capabilities,
      });
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["admin-capability-grants"] });
      qc.invalidateQueries({ queryKey: ["my-admin-capabilities"] });
    },
  });
}
