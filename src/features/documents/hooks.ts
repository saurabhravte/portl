import { useSupabase } from "@/lib/supabase";
import { useSessionStore } from "@/stores/session";
import {
  idSchema,
  parseInput,
  societyDocumentSchema,
} from "@/lib/validation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type SocietyDocumentRow = {
  id: string;
  title: string;
  category: string;
  description: string | null;
  storage_ref: string;
  file_name: string | null;
  mime_type: string | null;
  visibility: "society" | "admins";
  uploaded_by: string;
  created_at: string;
  archived_at: string | null;
};

export function useSocietyDocuments() {
  const supabase = useSupabase();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  return useQuery({
    queryKey: ["society-documents", societyId],
    enabled: !!societyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("society_documents")
        .select(
          "id,title,category,description,storage_ref,file_name,mime_type,visibility,uploaded_by,created_at,archived_at",
        )
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as SocietyDocumentRow[];
    },
  });
}

export function useDocumentMutations() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["society-documents"] });

  const create = useMutation({
    mutationFn: async (input: {
      title: string;
      category?: "general" | "bylaws" | "minutes" | "circular" | "form" | "other";
      description?: string;
      storageRef: string;
      fileName?: string;
      mimeType?: string;
      visibility?: "society" | "admins";
    }) => {
      const parsed = parseInput(societyDocumentSchema, {
        title: input.title,
        category: input.category ?? "general",
        description: input.description,
        storageRef: input.storageRef,
        fileName: input.fileName,
        mimeType: input.mimeType,
        visibility: input.visibility ?? "society",
      });
      const { error } = await supabase.from("society_documents").insert({
        society_id: profile!.society_id,
        title: parsed.title,
        category: parsed.category,
        description: parsed.description ?? null,
        storage_ref: parsed.storageRef,
        file_name: parsed.fileName ?? null,
        mime_type: parsed.mimeType ?? null,
        visibility: parsed.visibility,
        uploaded_by: profile!.id,
      });
      if (error) throw error;
    },
    onSettled: invalidate,
  });

  const archive = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      ({ id } = parseInput(idSchema, { id }));
      const { error } = await supabase
        .from("society_documents")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: invalidate,
  });

  return { create, archive };
}
