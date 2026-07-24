import { useSupabase } from "@/lib/supabase";
import { parseInput, uuidSchema } from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

const ratingSchema = z.strictObject({
  providerId: uuidSchema,
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

export function useProviderRatings(providerId: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["provider-rating", providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("provider_rating_summary", {
        p_provider_id: providerId,
      });
      if (error) throw error;
      return data as unknown as { avg: number | null; count: number };
    },
  });
}

export function useRateProvider() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async (input: {
      providerId: string;
      rating: number;
      comment?: string;
    }) => {
      const parsed = parseInput(ratingSchema, input);
      const { error } = await supabase.from("service_provider_ratings").upsert(
        {
          society_id: profile!.society_id,
          provider_id: parsed.providerId,
          profile_id: profile!.id,
          rating: parsed.rating,
          comment: parsed.comment ?? null,
        },
        { onConflict: "provider_id,profile_id" },
      );
      if (error) throw error;
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ["provider-rating", vars.providerId] });
    },
  });
}

export function useMyBadges() {
  const supabase = useSupabase();
  const profileId = useSessionStore((s) => s.profile?.id);
  return useQuery({
    queryKey: ["profile-badges", profileId],
    enabled: !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("profile_badges");
      if (error) throw error;
      return data as unknown as {
        helpful_resident: boolean;
        kudos_90d: number;
      };
    },
  });
}

export function useGiveKudos() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      toProfileId: string;
      reason?: "helpdesk" | "community" | "other";
      refId?: string;
    }) => {
      const { data, error } = await supabase.rpc("give_resident_kudos", {
        p_to_profile_id: input.toProfileId,
        p_reason: input.reason ?? "other",
        p_ref_id: input.refId,
      });
      if (error) throw error;
      return data as unknown as {
        ok: boolean;
        kudos_90d: number;
        helpful_badge: boolean;
      };
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["profile-badges"] }),
  });
}

export function useCalendarFeedUrl() {
  const supabase = useSupabase();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  return useQuery({
    queryKey: ["calendar-feed", societyId],
    enabled: !!societyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_society_calendar_token");
      if (error) throw error;
      const base = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
      if (!base || !data) return null;
      return `${base}/functions/v1/society-calendar-ics?token=${data}`;
    },
  });
}

export function useMyDefaulterFlag() {
  const supabase = useSupabase();
  const flatId = useSessionStore((s) => s.profile?.flat_id);
  return useQuery({
    queryKey: ["my-defaulter-flag", flatId],
    enabled: !!flatId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flat_defaulter_flags")
        .select("id,period,reason,flagged_at")
        .eq("flat_id", flatId!)
        .is("cleared_at", null)
        .order("flagged_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
