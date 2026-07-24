import { useSupabase } from "@/lib/supabase";
import {
  noticeCreateSchema,
  noticeUpdateSchema,
  parseInput,
  uuidSchema,
} from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface NoticeRow {
  id: string;
  title: string;
  body: string;
  audience: string;
  published_at: string | null;
  expires_at: string | null;
  pinned_at?: string | null;
  attachments: string[];
  target_tower_ids: string[];
  target_flat_ids: string[];
  notified_at: string | null;
  updated_at: string;
  reads: { profile_id: string; read_at: string }[];
}

export function useNotices() {
  const supabase = useSupabase();
  const profileId = useSessionStore((s) => s.profile?.id);
  const role = useSessionStore((s) => s.profile?.role);
  return useQuery({
    queryKey: ["notices", profileId],
    enabled: !!profileId,
    queryFn: async () => {
      let query = supabase
        .from("notices")
        .select(
          "id,title,body,audience,published_at,expires_at,pinned_at,attachments,target_tower_ids,target_flat_ids,notified_at,updated_at,reads:notice_reads(profile_id,read_at)",
        )
        .order("pinned_at", { ascending: false, nullsFirst: false })
        .order("published_at", { ascending: false })
        .limit(50);
      if (role !== "admin") {
        query = query
          .lte("published_at", new Date().toISOString())
          .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
      }
      const { data, error } = await query;
      if (error) throw error;
      const rows = data as unknown as NoticeRow[];
      return [...rows].sort((a, b) => {
        const ap = a.pinned_at ? 1 : 0;
        const bp = b.pinned_at ? 1 : 0;
        if (ap !== bp) return bp - ap;
        return (b.published_at ?? "").localeCompare(a.published_at ?? "");
      });
    },
  });
}

export function usePublishNotice() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async (input: {
      title: string;
      body: string;
      audience?: string;
      publishedAt?: Date | null;
      expiresAt?: Date | null;
      attachments?: string[];
      targetTowerIds?: string[];
      targetFlatIds?: string[];
    }) => {
      input = parseInput(noticeCreateSchema, input);
      const { error } = await supabase.from("notices").insert({
        society_id: profile!.society_id,
        title: input.title,
        body: input.body,
        audience: input.audience ?? "all",
        published_at:
          input.publishedAt === null
            ? null
            : (input.publishedAt ?? new Date()).toISOString(),
        expires_at: input.expiresAt?.toISOString() ?? null,
        attachments: input.attachments ?? [],
        target_tower_ids: input.targetTowerIds ?? [],
        target_flat_ids: input.targetFlatIds ?? [],
        created_by: profile!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notices"] }),
  });
}

export function useMarkNoticeRead() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profileId = useSessionStore((s) => s.profile?.id);
  return useMutation({
    mutationFn: async (noticeId: string) => {
      noticeId = parseInput(uuidSchema, noticeId);
      const { error } = await supabase.from("notice_reads").upsert(
        { notice_id: noticeId, profile_id: profileId!, read_at: new Date().toISOString() },
        { onConflict: "notice_id,profile_id", ignoreDuplicates: true },
      );
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notices"] }),
  });
}

export function useUpdateNotice() {
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
          NoticeRow,
          | "title"
          | "body"
          | "audience"
          | "published_at"
          | "expires_at"
          | "attachments"
          | "target_tower_ids"
          | "target_flat_ids"
        >
      >;
    }) => {
      id = parseInput(uuidSchema, id);
      changes = parseInput(noticeUpdateSchema, changes);
      const { error } = await supabase
        .from("notices")
        .update({ ...changes, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notices"] }),
  });
}

export function useDeleteNotice() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      id = parseInput(uuidSchema, id);
      const { error } = await supabase.from("notices").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notices"] }),
  });
}

export function useSetNoticePinned() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      id = parseInput(uuidSchema, id);
      const { error } = await supabase.rpc("set_notice_pinned", {
        p_notice_id: id,
        p_pinned: pinned,
      });
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["notices"] });
      qc.invalidateQueries({ queryKey: ["admin-dataset", "notices"] });
    },
  });
}

export function useNoticeReaders(noticeId: string | null) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["notice-readers", noticeId],
    enabled: !!noticeId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("notice_readers", {
        p_notice_id: noticeId!,
      });
      if (error) throw error;
      return (data as unknown as {
        profile_id: string;
        name: string;
        flat_number: string | null;
        read_at: string;
      }[]) ?? [];
    },
  });
}
