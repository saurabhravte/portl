import {
  normalizeIdentity,
  type IdentityType,
} from "@/features/auth/identity";
import type { TablesUpdate } from "@/lib/database.types";
import { useSupabase } from "@/lib/supabase";
import {
  auditExportSchema,
  auditFilterSchema,
  bulkFlatImportSchema,
  dueRaiseSchema,
  flatSchema,
  idSchema,
  inviteIdentitySchema,
  parseInput,
  profileUpdateSchema,
  staffSchema,
  towerSchema,
  visitorTypeSchema,
} from "@/lib/validation";
import { useSessionStore, type Role } from "@/stores/session";
import type { VisitorType } from "@/features/visitors/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

const adminDatasetInputSchema = z.strictObject({
  search: z.string().trim().max(200).optional(),
  filters: z.record(
    z.string().max(80),
    z.union([z.string().max(200), z.boolean(), z.undefined()]),
  ).optional(),
  after: z.strictObject({
    sort: z.string().max(200),
    id: z.uuid(),
  }).nullable().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
});
const societySettingsSchema = z.object({
  autoApproveTypes: z.array(visitorTypeSchema).max(4).optional(),
  lateFeeEnabled: z.boolean().optional(),
  lateFeeGraceDays: z.number().int().min(0).max(90).optional(),
  lateFeeAmount: z.number().min(0).max(100000).optional(),
  lateFeePercent: z.number().min(0).max(100).optional(),
  duesDueDay: z.number().int().min(1).max(28).optional(),
}).passthrough();
const autoApproveTypesSchema = z.array(visitorTypeSchema).max(4).refine(
  (types) => new Set(types).size === types.length,
  "Remove duplicate visitor types.",
);
const lateFeeSettingsSchema = z.strictObject({
  lateFeeEnabled: z.boolean(),
  lateFeeGraceDays: z.number().int().min(0).max(90),
  lateFeeAmount: z.number().min(0).max(100000),
  lateFeePercent: z.number().min(0).max(100),
  duesDueDay: z.number().int().min(1).max(28),
});
const flatImportResultSchema = z.strictObject({
  job_id: z.uuid(),
  status: z.enum(["validated", "applied", "rejected"]),
  dry_run: z.boolean(),
  rows: z.array(z.strictObject({
    line: z.number().int().positive(),
    tower: z.string().max(80),
    flat: z.string().max(40),
    status: z.enum(["failed", "existing", "would_create", "created"]),
    code: z.string().max(80).optional(),
    message: z.string().max(500).optional(),
  })).max(500),
  success_count: z.number().int().nonnegative(),
  failure_count: z.number().int().nonnegative(),
  created_towers: z.number().int().nonnegative(),
  created_flats: z.number().int().nonnegative(),
  idempotent_replay: z.boolean(),
});

export type { VisitorType };
export const VISITOR_TYPES: VisitorType[] = ["guest", "delivery", "cab", "service"];

export interface SocietySettings {
  autoApproveTypes?: VisitorType[];
  lateFeeEnabled?: boolean;
  lateFeeGraceDays?: number;
  lateFeeAmount?: number;
  lateFeePercent?: number;
  duesDueDay?: number;
}

export interface AdminPage<T> {
  rows: T[];
  total_count: number;
  next_cursor: { sort: string; id: string } | null;
  has_more: boolean;
}

export interface AdminPageInput {
  search?: string;
  filters?: Record<string, string | boolean | undefined>;
  after?: { sort: string; id: string } | null;
  limit?: number;
  enabled?: boolean;
}

function useAdminDatasetPage<T>(dataset: string, input: AdminPageInput = {}) {
  const parsedInput = parseInput(adminDatasetInputSchema, input);
  const supabase = useSupabase();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  const filters = Object.fromEntries(
    Object.entries(parsedInput.filters ?? {}).filter((entry) => entry[1] !== undefined),
  );
  const filterKey = JSON.stringify(filters);
  const cursorKey = parsedInput.after ? `${parsedInput.after.sort}:${parsedInput.after.id}` : "";
  return useQuery({
    queryKey: ["admin-dataset", dataset, societyId, parsedInput.search ?? "", filterKey, cursorKey],
    enabled: !!societyId && parsedInput.enabled !== false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_dataset_page", {
        p_dataset: dataset,
        p_limit: parsedInput.limit ?? 25,
        p_after: parsedInput.after ?? null,
        p_search: parsedInput.search || undefined,
        p_filters: filters,
      });
      if (error) throw error;
      return data as unknown as AdminPage<T>;
    },
    placeholderData: (previous) => previous,
  });
}

/** Society settings (auto-approve guest types, etc.). */
export function useSocietySettings() {
  const supabase = useSupabase();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  return useQuery({
    queryKey: ["society-settings", societyId],
    enabled: !!societyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("societies")
        .select("id,settings")
        .eq("id", societyId!)
        .single();
      if (error) throw error;
      return parseInput(societySettingsSchema, data.settings ?? {}) as SocietySettings;
    },
  });
}

/** Toggle which guest types are auto-approved at the gate. */
export function useUpdateAutoApproveTypes() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  return useMutation({
    mutationFn: async (autoApproveTypes: VisitorType[]) => {
      autoApproveTypes = parseInput(autoApproveTypesSchema, autoApproveTypes);
      const { data: current, error: e1 } = await supabase
        .from("societies")
        .select("settings")
        .eq("id", societyId!)
        .single();
      if (e1) throw e1;
      const settings = {
        ...parseInput(societySettingsSchema, current?.settings ?? {}),
        autoApproveTypes,
      };
      const { error } = await supabase
        .from("societies")
        .update({ settings })
        .eq("id", societyId!);
      if (error) throw error;
      return settings;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["society-settings"] }),
  });
}

/** Admin late-fee policy on society.settings (feature #69). */
export function useUpdateLateFeeSettings() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  return useMutation({
    mutationFn: async (patch: z.infer<typeof lateFeeSettingsSchema>) => {
      patch = parseInput(lateFeeSettingsSchema, patch);
      const { data: current, error: e1 } = await supabase
        .from("societies")
        .select("settings")
        .eq("id", societyId!)
        .single();
      if (e1) throw e1;
      const settings = {
        ...parseInput(societySettingsSchema, current?.settings ?? {}),
        ...patch,
      };
      const { error } = await supabase
        .from("societies")
        .update({ settings })
        .eq("id", societyId!);
      if (error) throw error;
      return settings;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["society-settings"] }),
  });
}

export function useTowerMutations() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["towers"] });
    qc.invalidateQueries({ queryKey: ["admin-flats"] });
  };
  const create = useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      ({ name } = parseInput(towerSchema, { name }));
      const { error } = await supabase
        .from("towers")
        .insert({ society_id: profile!.society_id, name });
      if (error) throw error;
    },
    onSettled: invalidate,
  });
  const remove = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      ({ id } = parseInput(idSchema, { id }));
      const { error } = await supabase.from("towers").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: invalidate,
  });
  return { create, remove };
}

// ── Flats ──────────────────────────────────────────────────────────────
export interface AdminFlatRow {
  id: string;
  number: string;
  occupancy_status: string;
  tower: { id: string; name: string } | null;
}

export function useAdminTowersPage(input?: AdminPageInput) {
  return useAdminDatasetPage<{ id: string; name: string; flat_count: number }>(
    "towers",
    input,
  );
}

export function useAdminFlatsPage(input?: AdminPageInput) {
  return useAdminDatasetPage<AdminFlatRow>("flats", input);
}

export function useFlatMutations() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-flats"] });
  const create = useMutation({
    mutationFn: async ({ towerId, number }: { towerId: string; number: string }) => {
      ({ towerId, number } = parseInput(flatSchema, { towerId, number }));
      const { error } = await supabase.from("flats").insert({
        society_id: profile!.society_id,
        tower_id: towerId,
        number,
      });
      if (error) throw error;
    },
    onSettled: invalidate,
  });
  const remove = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      ({ id } = parseInput(idSchema, { id }));
      const { error } = await supabase.from("flats").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: invalidate,
  });
  return { create, remove };
}

// ── Residents / user provisioning ──────────────────────────────────────
export interface AdminProfileRow {
  id: string;
  name: string;
  role: Role;
  phone: string | null;
  flat: { id: string; number: string } | null;
}

export function useAdminProfilesPage(input?: AdminPageInput) {
  return useAdminDatasetPage<AdminProfileRow>("profiles", input);
}

/** Link a signed-up user to a role/flat, or update an existing member. */
export function useUpdateProfile() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      role,
      flatId,
    }: {
      id: string;
      role?: Role;
      flatId?: string | null;
    }) => {
      ({ id, role, flatId } = parseInput(profileUpdateSchema, { id, role, flatId }));
      const patch: TablesUpdate<"profiles"> = {};
      if (role) patch.role = role;
      if (flatId !== undefined) patch.flat_id = flatId;
      const { error } = await supabase.from("profiles").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin-profiles"] }),
  });
}

// ── Amenities (admin) ──────────────────────────────────────────────────
export function useAmenityMutations() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["amenities"] });
  const create = useMutation({
    mutationFn: async ({ name, slotMinutes }: { name: string; slotMinutes: number }) => {
      const parsed = parseInput(
        z.strictObject({
          name: z.string().trim().min(2, "Enter an amenity name.").max(120),
          slotMinutes: z.number().int().min(5).max(1440),
        }),
        { name, slotMinutes },
      );
      const { error } = await supabase.from("amenities").insert({
        society_id: profile!.society_id,
        name: parsed.name,
        slot_minutes: parsed.slotMinutes,
      });
      if (error) throw error;
    },
    onSettled: invalidate,
  });
  const deactivate = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      ({ id } = parseInput(idSchema, { id }));
      const { error } = await supabase
        .from("amenities")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: invalidate,
  });
  return { create, deactivate };
}

// ── Staff (admin) ──────────────────────────────────────────────────────
export function useStaffMutations() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["staff"] });
  const create = useMutation({
    mutationFn: async ({ name, category, phone }: { name: string; category: string; phone?: string }) => {
      ({ name, category, phone } = parseInput(staffSchema, { name, category, phone }));
      const { error } = await supabase.from("staff").insert({
        society_id: profile!.society_id,
        name,
        category,
        phone: phone ?? null,
      });
      if (error) throw error;
    },
    onSettled: invalidate,
  });
  const deactivate = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      ({ id } = parseInput(idSchema, { id }));
      const { error } = await supabase.from("staff").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSettled: invalidate,
  });
  return { create, deactivate };
}

// ── Dues (admin) ───────────────────────────────────────────────────────
export function useDueMutations() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dues"] });
    qc.invalidateQueries({ queryKey: ["admin-dataset", "dues"] });
  };

  /** Raise the same amount against every flat for a period (e.g. "2026-07"). */
  const raiseForAll = useMutation({
    mutationFn: async ({ period, amount }: { period: string; amount: number }) => {
      ({ period, amount } = parseInput(dueRaiseSchema, { period, amount }));
      const { data, error } = await supabase.rpc("raise_dues_for_all_flats", {
        p_period: period,
        p_amount: amount,
      });
      if (error) throw error;
      return data;
    },
    onSettled: invalidate,
  });

  const markPaid = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      ({ id } = parseInput(idSchema, { id }));
      const { error } = await supabase
        .from("maintenance_dues")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: invalidate,
  });

  const waiveLateFee = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      ({ id } = parseInput(idSchema, { id }));
      const { error } = await supabase.rpc("waive_due_late_fee", {
        p_due_id: id,
      });
      if (error) throw error;
    },
    onSettled: invalidate,
  });

  const applyLateFeesNow = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("apply_maintenance_late_fees", {
        p_limit: 500,
      });
      if (error) throw error;
      return data as unknown as { applied: number; skipped: number };
    },
    onSettled: invalidate,
  });

  return { raiseForAll, markPaid, waiveLateFee, applyLateFeesNow };
}

// ── Dues claim confirmation (admin) ────────────────────────────────────
/** Admin confirms a resident's payment claim, or rejects it back to `due`. */
export function useDueClaimActions() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dues"] });
    qc.invalidateQueries({ queryKey: ["admin-dataset", "dues"] });
  };

  const confirm = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      ({ id } = parseInput(idSchema, { id }));
      const { error } = await supabase
        .from("maintenance_dues")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          confirmed_by: profile!.id,
        })
        .eq("id", id)
        .eq("status", "claimed");
      if (error) throw error;
    },
    onSettled: invalidate,
  });

  const reject = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      ({ id } = parseInput(idSchema, { id }));
      const { error } = await supabase
        .from("maintenance_dues")
        .update({
          status: "due",
          claimed_at: null,
          claimed_by: null,
          payment_note: null,
        })
        .eq("id", id)
        .eq("status", "claimed");
      if (error) throw error;
    },
    onSettled: invalidate,
  });

  return { confirm, reject };
}

// ── Invites (admin onboarding by phone) ────────────────────────────────
export interface InviteRow {
  id: string;
  identity_type: "email" | "phone";
  identity_value: string;
  name: string | null;
  role: Role;
  flat: { id: string; number: string } | null;
  claimed_by: string | null;
  created_at: string;
}

export function useAdminInvitesPage(input?: AdminPageInput) {
  return useAdminDatasetPage<InviteRow>("invites", input);
}

export interface AdminStaffRow {
  id: string;
  name: string;
  category: string;
  phone: string | null;
  checkin_code?: string | null;
  is_active: boolean;
}

export interface AdminDueRow {
  id: string;
  period: string;
  amount: number;
  due_on: string | null;
  late_fee_amount: number;
  late_fee_applied_at: string | null;
  late_fee_waived_at: string | null;
  status: "due" | "claimed" | "paid" | "waived";
  paid_at: string | null;
  claimed_at: string | null;
  payment_note: string | null;
  flat: { id: string; number: string; tower_name: string } | null;
}

export const useAdminStaffPage = (input?: AdminPageInput) =>
  useAdminDatasetPage<AdminStaffRow>("staff", input);
export const useAdminProvidersPage = <T,>(input?: AdminPageInput) =>
  useAdminDatasetPage<T>("providers", input);
export const useAdminDuesPage = (input?: AdminPageInput) =>
  useAdminDatasetPage<AdminDueRow>("dues", input);
export const useAdminAmenitiesPage = <T,>(input?: AdminPageInput) =>
  useAdminDatasetPage<T>("amenities", input);
export const useAdminBookingsPage = <T,>(input?: AdminPageInput) =>
  useAdminDatasetPage<T>("bookings", input);
export const useAdminPollsPage = <T,>(input?: AdminPageInput) =>
  useAdminDatasetPage<T>("polls", input);
export const useAdminNoticesPage = <T,>(input?: AdminPageInput) =>
  useAdminDatasetPage<T>("notices", input);

export function useInviteMutations() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["invites"] });

  const create = useMutation({
    mutationFn: async ({
      identityType,
      identityValue,
      name,
      role,
      flatId,
    }: {
      identityType: IdentityType;
      identityValue: string;
      name?: string;
      role: Role;
      flatId?: string | null;
    }) => {
      ({ identityType, identityValue, name, role, flatId } = parseInput(
        inviteIdentitySchema,
        { identityType, identityValue, name, role, flatId },
      ));
      const normalized = normalizeIdentity(identityType, identityValue);
      const { error } = await supabase.from("invites").insert({
        society_id: profile!.society_id,
        phone: identityType === "phone" ? normalized : null,
        email: identityType === "email" ? normalized : null,
        identity_type: identityType,
        identity_value: normalized,
        name: name || null,
        role,
        flat_id: flatId ?? null,
        created_by: profile!.id,
      });
      if (error) throw error;
    },
    onSettled: invalidate,
  });

  const revoke = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      ({ id } = parseInput(idSchema, { id }));
      const { error } = await supabase
        .from("invites")
        .delete()
        .eq("id", id)
        .is("claimed_by", null);
      if (error) throw error;
    },
    onSettled: invalidate,
  });

  return { create, revoke };
}

// ── Bulk flat import ───────────────────────────────────────────────────
export function useBulkImportFlats() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      rows,
      idempotencyKey,
      dryRun,
      allOrNothing = true,
    }: {
      rows: { line: number; tower: string; flat: string }[];
      idempotencyKey: string;
      dryRun: boolean;
      allOrNothing?: boolean;
    }) => {
      ({ rows, idempotencyKey, dryRun, allOrNothing } = parseInput(
        bulkFlatImportSchema,
        { rows, idempotencyKey, dryRun, allOrNothing },
      ));
      const { data, error } = await supabase.rpc("import_flats_transactional", {
        p_idempotency_key: idempotencyKey,
        p_rows: rows,
        p_dry_run: dryRun,
        p_all_or_nothing: allOrNothing,
      });
      if (error) throw error;
      return parseInput(flatImportResultSchema, data);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["towers"] });
      qc.invalidateQueries({ queryKey: ["admin-flats"] });
      qc.invalidateQueries({ queryKey: ["admin-dataset"] });
    },
  });
}

// ── Approval analytics ─────────────────────────────────────────────────
export interface ApprovalStats {
  median_manual_seconds: number | null;
  approved: number;
  auto_approved: number;
  denied: number;
  expired: number;
}

export function useApprovalStats(days = 7) {
  days = parseInput(z.number().int().min(1).max(3650), days);
  const supabase = useSupabase();
  const role = useSessionStore((s) => s.profile?.role);
  return useQuery({
    queryKey: ["approval-stats", days],
    enabled: role === "admin",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("approval_time_stats", {
        p_days: days,
      });
      if (error) throw error;
      return data as unknown as ApprovalStats;
    },
    staleTime: 60_000,
  });
}

export interface AdminAuditEvent {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  correlation_id: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  created_at: string;
}

export function useAdminAuditPage(input: {
  search?: string;
  action?: string;
  targetType?: string;
  after?: { created_at: string; id: string } | null;
  limit?: number;
}) {
  const parsedInput = parseInput(auditFilterSchema, input);
  const supabase = useSupabase();
  const societyId = useSessionStore((state) => state.profile?.society_id);
  return useQuery({
    queryKey: ["admin-audit", societyId, parsedInput],
    enabled: !!societyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_audit_page", {
        p_limit: parsedInput.limit ?? 25,
        p_after: parsedInput.after ?? null,
        p_search: parsedInput.search || undefined,
        p_action: parsedInput.action || undefined,
        p_target_type: parsedInput.targetType || undefined,
      });
      if (error) throw error;
      return data as unknown as Omit<AdminPage<AdminAuditEvent>, "next_cursor"> & {
        next_cursor: { created_at: string; id: string } | null;
      };
    },
    placeholderData: (previous) => previous,
  });
}

export function useCreateAuditExport() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ format, filters }: {
      format: "csv" | "json";
      filters?: Record<string, string>;
    }) => {
      ({ format, filters } = parseInput(auditExportSchema, { format, filters }));
      const { data, error } = await supabase.rpc("create_admin_audit_export", {
        p_format: format,
        p_filters: filters ?? {},
      });
      if (error) throw error;
      return data;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin-audit-exports"] }),
  });
}

export function useAuditExports() {
  const supabase = useSupabase();
  const societyId = useSessionStore((state) => state.profile?.society_id);
  return useQuery({
    queryKey: ["admin-audit-exports", societyId],
    enabled: !!societyId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_export_jobs")
        .select("id,format,status,created_at,error_code,artifact:export_artifacts(id,status,expires_at)")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });
}
