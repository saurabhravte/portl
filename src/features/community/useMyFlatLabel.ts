import { useSupabase } from "@/lib/supabase";
import { useSessionStore } from "@/stores/session";
import { useQuery } from "@tanstack/react-query";

/** "Tower A · Flat 502" for the home greeting. */
export function useMyFlatLabel() {
  const supabase = useSupabase();
  const flatId = useSessionStore((s) => s.profile?.flat_id);
  return useQuery({
    queryKey: ["my-flat-label", flatId],
    enabled: !!flatId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flats")
        .select("number,tower:towers(name)")
        .eq("id", flatId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const towerRel = data.tower as { name: string } | { name: string }[] | null;
      const towerName = Array.isArray(towerRel)
        ? towerRel[0]?.name
        : towerRel?.name;
      return towerName
        ? `${towerName} · Flat ${data.number}`
        : `Flat ${data.number}`;
    },
  });
}
