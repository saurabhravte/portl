import { useSupabase } from "@/lib/supabase";
import { parseInput } from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

export type SocietyAnalytics = {
  days: number;
  generated_at: string;
  traffic: {
    days: number;
    entries: number;
    exits: number;
    inside_now: number;
    by_hour: { hour: number; count: number }[];
    by_dow: { dow: number; count: number }[];
    heatmap: { dow: number; hour: number; count: number }[];
  };
  approvals: {
    days?: number;
    total_requests?: number;
    median_manual_seconds: number | null;
    approved: number;
    auto_approved: number;
    denied: number;
    expired: number;
  };
  complaints: {
    days: number;
    total: number;
    open: number;
    in_progress: number;
    resolved: number;
    closed: number;
    median_first_response_hours: number;
    median_resolution_hours: number;
    sla_hit_pct: number | null;
  };
  amenities: {
    days: number;
    total_bookings: number;
    confirmed: number;
    cancelled: number;
    no_shows: number;
    checked_in: number;
    revenue: number;
    penalties_due: number;
    by_amenity: {
      amenity_id: string;
      amenity_name: string;
      bookings: number;
      checked_in: number;
      cancelled: number;
      no_shows: number;
      revenue: number;
    }[];
  };
  dues: {
    period: string;
    flat_count: number;
    raised: number;
    paid: number;
    waived: number;
    outstanding: number;
    amount_raised: number;
    amount_collected: number;
    amount_outstanding: number;
    collection_pct: number | null;
    defaulters: {
      due_id: string;
      flat_id: string;
      flat_number: string;
      tower_name: string;
      period: string;
      status: string;
      amount: number;
      late_fee_amount: number;
      payable: number;
    }[];
  };
  polls: {
    days: number;
    poll_count: number;
    avg_participation_pct: number | null;
    polls: {
      poll_id: string;
      question: string;
      vote_count: number;
      eligible_flats: number;
      participation_pct: number | null;
      quorum_percent: number | null;
      quorum_met: boolean | null;
    }[];
  };
  guards: {
    window_days: number;
    summary: {
      scheduled: number;
      checked_in: number;
      completed: number;
      missed: number;
      cancelled: number;
      on_duty_now: number;
    };
    by_guard: {
      guard_id: string;
      guard_name: string;
      completed: number;
      missed: number;
      scheduled: number;
      checked_in: number;
      cancelled: number;
      completion_pct: number | null;
    }[];
  };
};

export function useSocietyAnalytics(days = 30) {
  days = parseInput(z.number().int().min(1).max(365), days);
  const supabase = useSupabase();
  const role = useSessionStore((s) => s.profile?.role);
  const societyId = useSessionStore((s) => s.profile?.society_id);
  return useQuery({
    queryKey: ["society-analytics", societyId, days],
    enabled: role === "admin" && !!societyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("society_analytics_bundle", {
        p_days: days,
      });
      if (error) throw error;
      return data as unknown as SocietyAnalytics;
    },
    staleTime: 60_000,
  });
}
