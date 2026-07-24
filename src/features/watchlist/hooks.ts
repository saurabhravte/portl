import { useSupabase } from "@/lib/supabase";
import {
  lookupWatchlistSchema,
  parseInput,
  uuidSchema,
  visitorWatchlistSchema,
} from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface WatchlistRow {
  id: string;
  kind: "blacklist" | "watchlist";
  name: string | null;
  phone: string | null;
  vehicle_no: string | null;
  reason: string;
  is_active: boolean;
  created_at: string;
}

export interface WatchlistMatch {
  id: string;
  kind: "blacklist" | "watchlist";
  name: string | null;
  phone: string | null;
  vehicle_no: string | null;
  reason: string;
}

export interface WatchlistLookup {
  matches: WatchlistMatch[];
  blocked: boolean;
}

export function useWatchlist() {
  const supabase = useSupabase();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  return useQuery({
    queryKey: ["visitor-watchlist", societyId],
    enabled: !!societyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visitor_watchlist")
        .select("id,kind,name,phone,vehicle_no,reason,is_active,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as WatchlistRow[];
    },
  });
}

export function useAddWatchlistEntry() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async (input: {
      kind: "blacklist" | "watchlist";
      name?: string;
      phone?: string;
      vehicleNo?: string;
      reason: string;
    }) => {
      const parsed = parseInput(visitorWatchlistSchema, input);
      if (!profile?.society_id) throw new Error("A society is required.");
      const { error } = await supabase.from("visitor_watchlist").insert({
        society_id: profile.society_id,
        created_by: profile.id,
        kind: parsed.kind,
        name: parsed.name ?? null,
        phone: parsed.phone ?? null,
        vehicle_no: parsed.vehicleNo ?? null,
        reason: parsed.reason,
        is_active: parsed.isActive,
      });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["visitor-watchlist"] }),
  });
}

export function useSetWatchlistActive() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const entryId = parseInput(uuidSchema, id);
      const { error } = await supabase
        .from("visitor_watchlist")
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq("id", entryId);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["visitor-watchlist"] }),
  });
}

export function useRemoveWatchlistEntry() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const entryId = parseInput(uuidSchema, id);
      const { error } = await supabase
        .from("visitor_watchlist")
        .delete()
        .eq("id", entryId);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["visitor-watchlist"] }),
  });
}

/** Guard gate lookup before / while registering a visitor. */
export function useLookupWatchlist() {
  const supabase = useSupabase();
  return useMutation({
    mutationFn: async (input: {
      phone?: string;
      name?: string;
      vehicleNo?: string;
    }): Promise<WatchlistLookup> => {
      const parsed = parseInput(lookupWatchlistSchema, input);
      const { data, error } = await supabase.rpc("lookup_watchlist", {
        p_phone: parsed.phone ?? undefined,
        p_name: parsed.name ?? undefined,
        p_vehicle_no: parsed.vehicleNo ?? undefined,
      });
      if (error) throw error;
      const result = (data ?? {
        matches: [],
        blocked: false,
      }) as unknown as WatchlistLookup;
      return {
        matches: Array.isArray(result.matches) ? result.matches : [],
        blocked: !!result.blocked,
      };
    },
  });
}
