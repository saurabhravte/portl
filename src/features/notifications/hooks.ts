import { useSupabase } from "@/lib/supabase";
import { parseInput, userIdSchema, uuidSchema } from "@/lib/validation";
import { queryKeys } from "@/lib/queryState";
import { useRealtimeRefreshPolicy } from "@/lib/realtimeHealth";
import { useSessionStore } from "@/stores/session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

const notificationSchema = z.strictObject({
  id: uuidSchema,
  type: z.string().trim().min(1).max(120),
  payload: z.object({
    title: z.string().trim().max(160).optional(),
    body: z.string().trim().max(2000).optional(),
    url: z.string().trim().max(500).optional(),
  }).passthrough(),
  read_at: z.iso.datetime({ offset: true }).nullable(),
  created_at: z.iso.datetime({ offset: true }),
});

export interface NotificationRow {
  id: string;
  type: string;
  payload: {
    title?: string;
    body?: string;
    url?: string;
    [key: string]: unknown;
  };
  read_at: string | null;
  created_at: string;
}

export function useNotifications() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const userId = useSessionStore((s) => s.profile?.id);
  const [realtimeHealthy, setRealtimeHealthy] = useState(false);
  const refresh = useCallback(
    () => void qc.invalidateQueries({ queryKey: queryKeys.notifications(userId) }),
    [qc, userId],
  );
  useRealtimeRefreshPolicy({ healthy: realtimeHealthy, refresh });

  const query = useQuery({
    queryKey: queryKeys.notifications(userId),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,type,payload,read_at,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return parseInput(z.array(notificationSchema).max(100), data) as NotificationRow[];
    },
  });

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`inbox-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: queryKeys.notifications(userId) });
        },
      )
      .subscribe((status) => setRealtimeHealthy(status === "SUBSCRIBED"));
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, userId, qc]);

  return query;
}

export function useUnreadCount() {
  const { data } = useNotifications();
  return data?.filter((n) => !n.read_at).length ?? 0;
}

export function useMarkRead() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      id = parseInput(uuidSchema, id);
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
        .is("read_at", null);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllRead() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const userId = useSessionStore((s) => s.profile?.id);
  return useMutation({
    mutationFn: async () => {
      const parsedUserId = parseInput(userIdSchema, userId);
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", parsedUserId)
        .is("read_at", null);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
