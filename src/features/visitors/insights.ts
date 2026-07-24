import { useSupabase } from "@/lib/supabase";
import { parseInput, requestHandlingSchema } from "@/lib/validation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface VisitorInsights {
  visit_count: number;
  known: boolean;
  last_seen_at?: string | null;
  first_seen_at?: string | null;
  avg_hour?: number | null;
}

/**
 * History-based "smart" insights for a phone number: how often this visitor
 * has come, when they typically arrive, and a "known" tag. Computed from the
 * society's gate logs — no external AI. Enabled once a phone is entered.
 */
export function useVisitorInsights(phone: string | undefined) {
  const supabase = useSupabase();
  const normalized = (phone ?? "").replace(/[^0-9]/g, "");
  return useQuery({
    queryKey: ["visitor-insights", normalized],
    enabled: normalized.length >= 6,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("visitor_insights", {
        p_phone: normalized,
      });
      if (error) throw error;
      return (data ?? { visit_count: 0, known: false }) as unknown as VisitorInsights;
    },
  });
}

/** Format the insight into a short human sentence for the gate/approve UI. */
export function describeInsights(i: VisitorInsights | undefined): string | null {
  if (!i || !i.visit_count) return null;
  const parts: string[] = [`${i.visit_count} past visit${i.visit_count === 1 ? "" : "s"}`];
  if (typeof i.avg_hour === "number") {
    const h = ((i.avg_hour + 11) % 12) + 1;
    const ampm = i.avg_hour < 12 ? "AM" : "PM";
    parts.push(`usually around ${h} ${ampm}`);
  }
  return parts.join(" · ");
}

/** Resident: mark a pending delivery as "leave at gate" (#4). */
export function useSetRequestHandling() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      requestId: string;
      handling: "normal" | "leave_at_gate";
    }) => {
      const { requestId, handling } = parseInput(requestHandlingSchema, input);
      const { error } = await supabase.rpc("set_request_handling", {
        p_request_id: requestId,
        p_handling: handling,
      });
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
      qc.invalidateQueries({ queryKey: ["gate"] });
    },
  });
}
