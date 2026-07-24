import { useSupabase } from "@/lib/supabase";
import { cctvCameraSchema, parseInput, uuidSchema } from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";

export interface CctvCameraRow {
  id: string;
  name: string;
  stream_url: string;
  stream_kind: "hls" | "embed" | "snapshot";
  gate_id: string | null;
  is_active: boolean;
  created_at: string;
  gate: { id: string; name: string } | null;
}

export function useCctvCameras() {
  const supabase = useSupabase();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  const role = useSessionStore((s) => s.profile?.role);
  return useQuery({
    queryKey: ["cctv-cameras", societyId, role],
    enabled: !!societyId,
    queryFn: async () => {
      let query = supabase
        .from("cctv_cameras")
        .select("id,name,stream_url,stream_kind,gate_id,is_active,created_at,gate:gates(id,name)")
        .order("name");
      if (role !== "admin") query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as CctvCameraRow[];
    },
  });
}

export function useSaveCctvCamera() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      name: string;
      streamUrl: string;
      streamKind?: "hls" | "embed" | "snapshot";
      gateId?: string;
      isActive?: boolean;
    }) => {
      const parsed = parseInput(cctvCameraSchema, input);
      if (!profile?.society_id) throw new Error("A society is required.");
      const row = {
        name: parsed.name,
        stream_url: parsed.streamUrl,
        stream_kind: parsed.streamKind,
        gate_id: parsed.gateId ?? null,
        is_active: parsed.isActive,
      };
      if (parsed.id) {
        const { error } = await supabase
          .from("cctv_cameras")
          .update(row)
          .eq("id", parsed.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("cctv_cameras").insert({
        ...row,
        society_id: profile.society_id,
        created_by: profile.id,
      });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["cctv-cameras"] }),
  });
}

export function useRemoveCctvCamera() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const cameraId = parseInput(uuidSchema, id);
      const { error } = await supabase.from("cctv_cameras").delete().eq("id", cameraId);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["cctv-cameras"] }),
  });
}

/** Open the configured stream in the system browser / in-app browser. */
export async function openCctvFeed(url: string) {
  await WebBrowser.openBrowserAsync(url, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
  });
}
