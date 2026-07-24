import {
  type IdentityType,
  normalizeIdentity,
} from "@/features/auth/identity";
import { buildUpiLink } from "@/features/productWorkflows/upi";
import type { Json } from "@/lib/database.types";
import { useSupabase } from "@/lib/supabase";
import {
  amenitySchema,
  bookingDecisionSchema,
  bookingSchema,
  bookingSeriesSchema,
  bookingWaitlistSchema,
  cancelBookingSchema,
  dueClaimSchema,
  gateCodeSchema,
  inviteIdentitySchema,
  parseInput,
  pollCreateSchema,
  pollUpdateSchema,
  serviceProviderSchema,
  uuidSchema,
  visitorTypeSchema,
  voteSchema,
} from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { z } from "zod";

export { buildUpiLink };

// ── Polls ──────────────────────────────────────────────────────────────
export interface PollRow {
  id: string;
  question: string;
  options: string[];
  closes_at: string;
  created_at: string;
  opens_at: string;
  closed_at: string | null;
  quorum_percent: number;
  is_anonymous: boolean;
  attachments: string[];
  target_tower_ids: string[];
  target_flat_ids: string[];
  notified_at: string | null;
  votes: { voter_id: string; flat_id: string; option_index: number }[];
  tallies?: { total: number; counts: number[] };
}

function stringArray(value: Json): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function usePolls() {
  const supabase = useSupabase();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  const role = useSessionStore((s) => s.profile?.role);
  return useQuery({
    queryKey: ["polls", societyId],
    enabled: !!societyId,
    queryFn: async () => {
      let query = supabase
        .from("polls")
        .select("id,question,options,opens_at,closes_at,closed_at,quorum_percent,is_anonymous,attachments,target_tower_ids,target_flat_ids,notified_at,created_at,votes:poll_votes(voter_id,flat_id,option_index)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (role !== "admin") query = query.lte("opens_at", new Date().toISOString());
      const { data, error } = await query;
      if (error) throw error;
      const polls = data.map((poll) => ({
        ...poll,
        options: stringArray(poll.options),
        is_anonymous: !!(poll as { is_anonymous?: boolean }).is_anonymous,
      })) as PollRow[];

      // Anonymous ballots: use server tallies so other flats' votes stay private.
      await Promise.all(
        polls.map(async (poll) => {
          if (!poll.is_anonymous && role === "admin") return;
          const { data: tally, error: tallyError } = await supabase.rpc(
            "poll_tallies",
            { p_poll_id: poll.id },
          );
          if (tallyError) return;
          const parsed = tally as unknown as { total?: number; counts?: number[] };
          poll.tallies = {
            total: parsed.total ?? 0,
            counts: Array.isArray(parsed.counts) ? parsed.counts : [],
          };
        }),
      );
      return polls;
    },
  });
}

export function useEligibleFlatCount() {
  const supabase = useSupabase();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  return useQuery({
    queryKey: ["eligible-flat-count", societyId],
    enabled: !!societyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("flats")
        .select("id", { count: "exact", head: true })
        .eq("society_id", societyId!);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useVote() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async ({ pollId, optionIndex }: { pollId: string; optionIndex: number }) => {
      ({ pollId, optionIndex } = parseInput(voteSchema, { pollId, optionIndex }));
      if (!profile?.flat_id) throw new Error("A linked flat is required to vote.");
      const { error } = await supabase.rpc("cast_poll_vote", {
        p_poll_id: pollId,
        p_option_index: optionIndex,
      });
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["polls"] }),
  });
}

export function useCreatePoll() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async ({
      question,
      options,
      closesAt,
      opensAt,
      quorumPercent = 0,
      isAnonymous = false,
      attachments = [],
      targetTowerIds = [],
      targetFlatIds = [],
    }: {
      question: string;
      options: string[];
      closesAt: Date;
      opensAt?: Date;
      quorumPercent?: number;
      isAnonymous?: boolean;
      attachments?: string[];
      targetTowerIds?: string[];
      targetFlatIds?: string[];
    }) => {
      ({
        question,
        options,
        closesAt,
        opensAt,
        quorumPercent,
        isAnonymous,
        attachments,
        targetTowerIds,
        targetFlatIds,
      } = parseInput(pollCreateSchema, {
        question,
        options,
        closesAt,
        opensAt,
        quorumPercent,
        isAnonymous,
        attachments,
        targetTowerIds,
        targetFlatIds,
      }));
      const { error } = await supabase.from("polls").insert({
        society_id: profile!.society_id,
        question,
        options,
        created_by: profile!.id,
        opens_at: (opensAt ?? new Date()).toISOString(),
        closes_at: closesAt.toISOString(),
        quorum_percent: quorumPercent,
        is_anonymous: isAnonymous,
        attachments,
        target_tower_ids: targetTowerIds,
        target_flat_ids: targetFlatIds,
      });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["polls"] }),
  });
}

export function useUpdatePoll() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      changes,
    }: {
      id: string;
      changes: Partial<
        Pick<
          PollRow,
          | "question"
          | "options"
          | "opens_at"
          | "closes_at"
          | "quorum_percent"
          | "is_anonymous"
          | "attachments"
          | "target_tower_ids"
          | "target_flat_ids"
        >
      >;
    }) => {
      id = parseInput(uuidSchema, id);
      changes = parseInput(pollUpdateSchema, changes);
      const { error } = await supabase.from("polls").update(changes).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["polls"] }),
  });
}

export function useClosePoll() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profileId = useSessionStore((s) => s.profile?.id);
  return useMutation({
    mutationFn: async (pollId: string) => {
      pollId = parseInput(uuidSchema, pollId);
      const { error } = await supabase
        .from("polls")
        .update({ closed_at: new Date().toISOString(), closed_by: profileId })
        .eq("id", pollId)
        .is("closed_at", null);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["polls"] }),
  });
}

export function useDeletePoll() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pollId: string) => {
      pollId = parseInput(uuidSchema, pollId);
      const { error } = await supabase.from("polls").delete().eq("id", pollId);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["polls"] }),
  });
}

// ── Amenities ──────────────────────────────────────────────────────────
export interface AmenityRow {
  id: string;
  name: string;
  description: string | null;
  open_time: string;
  close_time: string;
  slot_minutes: number;
  capacity: number;
  price: number;
  cancellation_cutoff_minutes: number;
  late_cancel_penalty: number;
  no_show_penalty: number;
  checkin_grace_minutes: number;
  requires_approval: boolean;
  rules: string | null;
  blackout_dates: string[];
  is_active: boolean;
}

export type BookingStatus =
  | "pending_payment"
  | "pending"
  | "confirmed"
  | "waitlisted"
  | "cancelled"
  | "rejected"
  | "no_show";

export interface BookingRow {
  id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  amenity_id: string;
  flat_id: string;
  booked_by: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  access_code: string | null;
  checked_in_at: string | null;
  series_id: string | null;
  payment_amount: number | null;
  paid_at: string | null;
  amenity: { name: string };
  flat?: { number: string } | null;
}

const BOOKING_STATUSES: readonly BookingStatus[] = [
  "pending_payment",
  "pending",
  "confirmed",
  "waitlisted",
  "cancelled",
  "rejected",
  "no_show",
];

export function useAmenities() {
  const supabase = useSupabase();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  const role = useSessionStore((s) => s.profile?.role);
  return useQuery({
    queryKey: ["amenities", societyId],
    enabled: !!societyId,
    queryFn: async () => {
      let query = supabase
        .from("amenities")
        .select("*")
        .order("name");
      if (role !== "admin") query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw error;
      return data as AmenityRow[];
    },
  });
}

export function useSaveAmenity() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  return useMutation({
    mutationFn: async (
      input: Partial<AmenityRow> & Pick<AmenityRow, "name"> & { id?: string },
    ) => {
      const { id, ...changes } = parseInput(amenitySchema, input);
      if (!id && !societyId) throw new Error("A society is required to create an amenity.");
      const { error } = id
        ? await supabase.from("amenities").update(changes).eq("id", id)
        : await supabase.from("amenities").insert({ ...changes, society_id: societyId! });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["amenities"] }),
  });
}

/** Upcoming bookings — residents see the society's calendar so they can
 *  pick a free slot; only their own bookings are cancellable. */
export function useBookings() {
  const supabase = useSupabase();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  const role = useSessionStore((s) => s.profile?.role);
  return useQuery({
    queryKey: ["bookings", societyId],
    enabled: !!societyId,
    queryFn: async () => {
      let query = supabase
        .from("amenity_bookings")
        .select(
          "id,starts_at,ends_at,status,amenity_id,flat_id,booked_by,decided_by,decided_at,decision_reason,access_code,checked_in_at,series_id,payment_amount,paid_at,amenity:amenities(name),flat:flats(number)",
        )
        .order("starts_at")
        .limit(100);
      if (role !== "admin") {
        query = query
          .in("status", ["pending_payment", "pending", "confirmed", "waitlisted"])
          .gte("ends_at", new Date().toISOString());
      }
      const { data, error } = await query;
      if (error) throw error;
      return data.map((booking): BookingRow => {
        if (!BOOKING_STATUSES.includes(booking.status as BookingStatus)) {
          throw new Error(`Unknown amenity booking status: ${booking.status}`);
        }
        return {
          ...booking,
          status: booking.status as BookingStatus,
        } as BookingRow;
      });
    },
  });
}

export function useBookAmenity() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      amenityId,
      startsAt,
      endsAt,
    }: {
      amenityId: string;
      startsAt: Date;
      endsAt: Date;
    }) => {
      ({ amenityId, startsAt, endsAt } = parseInput(bookingSchema, {
        amenityId,
        startsAt,
        endsAt,
      }));
      const { data, error } = await supabase.rpc("book_amenity", {
        p_amenity_id: amenityId,
        p_starts_at: startsAt.toISOString(),
        p_ends_at: endsAt.toISOString(),
      });
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return data as string;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
  });
}

export function useBookAmenitySeries() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      amenityId,
      startsAt,
      weeks = 4,
    }: {
      amenityId: string;
      startsAt: Date;
      weeks?: number;
    }) => {
      const parsed = parseInput(bookingSeriesSchema, { amenityId, startsAt, weeks });
      const { data, error } = await supabase.rpc("book_amenity_series", {
        p_amenity_id: parsed.amenityId,
        p_starts_at: parsed.startsAt.toISOString(),
        p_weeks: parsed.weeks,
      });
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return data as {
        seriesId: string;
        bookedCount: number;
        skipped: number;
      };
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
  });
}

export function useJoinAmenityWaitlist() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      amenityId,
      startsAt,
      endsAt,
    }: {
      amenityId: string;
      startsAt: Date;
      endsAt: Date;
    }) => {
      const parsed = parseInput(bookingWaitlistSchema, { amenityId, startsAt, endsAt });
      const { data, error } = await supabase.rpc("join_amenity_waitlist", {
        p_amenity_id: parsed.amenityId,
        p_starts_at: parsed.startsAt.toISOString(),
        p_ends_at: parsed.endsAt.toISOString(),
      });
      if (error) throw error;
      return data as string;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["amenity-waitlist"] });
    },
  });
}

export function useCancelBooking() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      bookingId,
      acceptPenalty = false,
    }: {
      bookingId: string;
      acceptPenalty?: boolean;
    }) => {
      const parsed = parseInput(cancelBookingSchema, { bookingId, acceptPenalty });
      const { data, error } = await supabase.rpc("cancel_my_amenity_booking", {
        p_booking_id: parsed.bookingId,
        p_accept_penalty: parsed.acceptPenalty,
      });
      if (error) throw error;
      return data as { id: string; status: string; penalty?: boolean };
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
  });
}

export function useDecideAmenityBooking() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      bookingId,
      decision,
      reason,
    }: {
      bookingId: string;
      decision: "confirmed" | "rejected";
      reason?: string;
    }) => {
      ({ bookingId, decision, reason } = parseInput(bookingDecisionSchema, {
        bookingId,
        decision,
        reason,
      }));
      const { error } = await supabase.rpc("decide_amenity_booking", {
        p_booking_id: bookingId,
        p_decision: decision,
        p_reason: reason ?? undefined,
      });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
  });
}

export function useRedeemAmenityAccess() {
  const supabase = useSupabase();
  return useMutation({
    mutationFn: async (code: string) => {
      const parsed = parseInput(gateCodeSchema, code);
      const { data, error } = await supabase.rpc("redeem_amenity_access", {
        p_code: parsed,
      });
      if (error) throw error;
      return data as {
        bookingId: string;
        amenityName: string;
        flatNumber: string;
        startsAt: string;
        endsAt: string;
        checkedInAt: string;
      };
    },
  });
}

export function useMarkAmenityNoShows() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("mark_amenity_no_shows", {
        p_limit: 100,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["amenity-usage-stats"] });
    },
  });
}

export function useAmenityUsageStats(days = 30) {
  const supabase = useSupabase();
  const role = useSessionStore((s) => s.profile?.role);
  return useQuery({
    queryKey: ["amenity-usage-stats", days],
    enabled: role === "admin",
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("amenity_usage_stats", {
        p_days: days,
      });
      if (error) throw error;
      return data as {
        days: number;
        total_bookings: number;
        confirmed: number;
        cancelled: number;
        no_shows: number;
        checked_in: number;
        pending_payment: number;
        waitlist_waiting: number;
        revenue: number;
        penalties_due: number;
        by_amenity: Array<{
          amenity_id: string;
          amenity_name: string;
          bookings: number;
          confirmed: number;
          cancelled: number;
          no_shows: number;
          checked_in: number;
          revenue: number;
        }>;
      };
    },
  });
}

// ── Staff directory ────────────────────────────────────────────────────
export interface StaffRow {
  id: string;
  name: string;
  category: string;
  phone: string | null;
  is_active: boolean;
}

export function useStaff() {
  const supabase = useSupabase();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  return useQuery({
    queryKey: ["staff", societyId],
    enabled: !!societyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id,name,category,phone,is_active")
        .eq("is_active", true)
        .order("category")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

export interface ServiceProviderRow {
  id: string;
  name: string;
  category: string;
  phone: string | null;
  photo_url: string | null;
  description: string | null;
  is_verified: boolean;
  is_available: boolean;
  availability_text: string | null;
}

export function useServiceProviders(search = "", category?: string) {
  const supabase = useSupabase();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  return useQuery({
    queryKey: ["service-providers", societyId, search, category],
    enabled: !!societyId,
    queryFn: async () => {
      let query = supabase
        .from("service_providers")
        .select(
          "id,name,category,phone,photo_url,description,is_verified,is_available,availability_text",
        )
        .order("is_available", { ascending: false })
        .order("name");
      if (search.trim()) {
        const term = search.trim().replace(/[%_,()]/g, "");
        query = query.or(`name.ilike.%${term}%,category.ilike.%${term}%`);
      }
      if (category) query = query.eq("category", category);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveServiceProvider() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  return useMutation({
    mutationFn: async (
      input: Partial<ServiceProviderRow> &
        Pick<ServiceProviderRow, "name" | "category"> & { id?: string },
    ) => {
      const { id, ...changes } = parseInput(serviceProviderSchema, input);
      if (!id && !societyId) {
        throw new Error("A society is required to create a service provider.");
      }
      const { error } = id
        ? await supabase.from("service_providers").update(changes).eq("id", id)
        : await supabase
            .from("service_providers")
            .insert({ ...changes, society_id: societyId! });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["service-providers"] }),
  });
}

// ── Maintenance dues ───────────────────────────────────────────────────
export interface DueRow {
  id: string;
  period: string;
  amount: number;
  due_on?: string | null;
  late_fee_amount?: number | null;
  late_fee_applied_at?: string | null;
  late_fee_waived_at?: string | null;
  status: "due" | "claimed" | "paid" | "waived";
  paid_at: string | null;
  claimed_at: string | null;
  payment_note: string | null;
  flat?: { number: string } | null;
}

export function useDues() {
  const supabase = useSupabase();
  const profile = useSessionStore((s) => s.profile);
  return useQuery({
    queryKey: ["dues", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maintenance_dues")
        .select(
          "id,period,amount,due_on,late_fee_amount,late_fee_applied_at,late_fee_waived_at,status,paid_at,claimed_at,payment_note,flat:flats(number)",
        )
        .order("period", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data.map((due): DueRow => {
        if (!["due", "claimed", "paid", "waived"].includes(due.status)) {
          throw new Error(`Unknown maintenance due status: ${due.status}`);
        }
        return { ...due, status: due.status as DueRow["status"] };
      });
    },
  });
}

/** Resident records a payment claim (due → claimed). An admin confirms it
 *  to 'paid' — residents can no longer close the society's books
 *  themselves (sprint ticket #3). */
export function useClaimDue() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) => {
      ({ id, note } = parseInput(dueClaimSchema, { id, note }));
      const { data, error } = await supabase
        .from("maintenance_dues")
        .update({
          status: "claimed",
          claimed_at: new Date().toISOString(),
          claimed_by: profile!.id,
          payment_note: note ?? "Claimed via Portl",
        })
        .eq("id", id)
        .eq("status", "due")
        .select("id,status");
      if (error) throw error;
      if (!data?.length)
        throw new Error("Could not update due — check permissions or status.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["dues"] }),
  });
}

/** Society name + UPI id (settings.upiId) so residents can pay via intent. */
export function useSocietyPayment() {
  const supabase = useSupabase();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  return useQuery({
    queryKey: ["society-payment", societyId],
    enabled: !!societyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("societies")
        .select("name,settings")
        .eq("id", societyId!)
        .single();
      if (error) throw error;
      const upiId =
        data.settings &&
        typeof data.settings === "object" &&
        !Array.isArray(data.settings) &&
        typeof data.settings.upiId === "string"
          ? data.settings.upiId
          : null;
      return { name: data.name, upiId };
    },
  });
}

/**
 * Per-society visitor auto-expiry window in milliseconds.
 * Single source of truth is societies.settings.visitorExpiryMinutes
 * (default 2, clamped 1–10 — mirrors visitor_expiry_minutes() in SQL,
 * migration 0025). Falls back to 2 minutes while loading.
 */
export const DEFAULT_VISITOR_EXPIRY_MS = 2 * 60 * 1000;

export function useVisitorExpiryMs(): number {
  const supabase = useSupabase();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  const { data } = useQuery({
    queryKey: ["visitor-expiry", societyId],
    enabled: !!societyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("societies")
        .select("settings")
        .eq("id", societyId!)
        .single();
      if (error) throw error;
      const raw =
        data.settings &&
        typeof data.settings === "object" &&
        !Array.isArray(data.settings)
          ? Number((data.settings as Record<string, unknown>).visitorExpiryMinutes)
          : NaN;
      const minutes = Number.isFinite(raw)
        ? Math.min(10, Math.max(1, Math.trunc(raw)))
        : 2;
      return minutes * 60 * 1000;
    },
  });
  return data ?? DEFAULT_VISITOR_EXPIRY_MS;
}

// ── Household (per-flat settings + member invites) ─────────────────────
export interface FlatSettings {
  noAutoApproveTypes?: string[];
}

/** My flat's settings (auto-approve opt-out per visitor type). */
export function useMyFlatSettings() {
  const supabase = useSupabase();
  const flatId = useSessionStore((s) => s.profile?.flat_id);
  return useQuery({
    queryKey: ["flat-settings", flatId],
    enabled: !!flatId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flats")
        .select("id,settings")
        .eq("id", flatId!)
        .single();
      if (error) throw error;
      const settings = data.settings;
      return {
        noAutoApproveTypes:
          settings &&
          typeof settings === "object" &&
          !Array.isArray(settings) &&
          Array.isArray(settings.noAutoApproveTypes)
            ? settings.noAutoApproveTypes.filter(
                (item): item is string => typeof item === "string",
              )
            : undefined,
      };
    },
  });
}

/** Opt my flat out of society-level auto-approval for given types. */
export function useSetAutoApproveOptOut() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (types: string[]) => {
      types = parseInput(z.array(visitorTypeSchema).max(4), types);
      const { error } = await supabase.rpc("set_my_flat_auto_approve_optout", {
        p_types: types,
      });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["flat-settings"] }),
  });
}

/** Invites this resident has raised for their own flat (household members). */
export interface HouseholdInvite {
  id: string;
  identity_type: IdentityType;
  identity_value: string;
  name: string | null;
  claimed_by: string | null;
  created_at: string;
}

export function useHouseholdInvites() {
  const supabase = useSupabase();
  const flatId = useSessionStore((s) => s.profile?.flat_id);
  return useQuery({
    queryKey: ["household-invites", flatId],
    enabled: !!flatId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invites")
        .select("*")
        .eq("flat_id", flatId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((invite) => {
        const identityType = invite.email ? "email" : "phone";
        return {
          id: String(invite.id),
          identity_type: identityType,
          identity_value: String(invite.email ?? invite.phone ?? ""),
          name: typeof invite.name === "string" ? invite.name : null,
          claimed_by:
            typeof invite.claimed_by === "string" ? invite.claimed_by : null,
          created_at: String(invite.created_at),
        } satisfies HouseholdInvite;
      });
    },
  });
}

/** Invite a family member to this flat (RLS restricts to role=resident). */
export function useInviteHouseholdMember() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async ({
      identityType,
      identityValue,
      name,
    }: {
      identityType: IdentityType;
      identityValue: string;
      name?: string;
    }) => {
      ({ identityType, identityValue, name } = parseInput(
        inviteIdentitySchema,
        { identityType, identityValue, name, role: "resident" },
      ));
      const normalized = normalizeIdentity(identityType, identityValue);
      const { error } = await supabase.from("invites").insert({
        society_id: profile!.society_id,
        flat_id: profile!.flat_id,
        role: "resident",
        phone: identityType === "phone" ? normalized : null,
        email: identityType === "email" ? normalized : null,
        name: name || null,
        created_by: profile!.id,
      });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["household-invites"] }),
  });
}
