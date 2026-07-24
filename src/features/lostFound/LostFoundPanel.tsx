import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  QueryErrorState,
  Skeleton,
} from "@/components/ui";
import { useSupabase } from "@/lib/supabase";
import {
  lostFoundSchema,
  parseInput,
  uuidSchema,
} from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import React, { useState } from "react";
import { Alert, Text, View } from "react-native";

export interface LostFoundRow {
  id: string;
  kind: "lost" | "found";
  title: string;
  description: string | null;
  photo_ref: string | null;
  location_note: string | null;
  contact_note: string | null;
  status: "open" | "claimed" | "closed";
  created_at: string;
  created_by: string;
}

function useLostFoundItems() {
  const supabase = useSupabase();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  return useQuery({
    queryKey: ["lost-found", societyId],
    enabled: !!societyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lost_found_items")
        .select(
          "id,kind,title,description,photo_ref,location_note,contact_note,status,created_at,created_by",
        )
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as LostFoundRow[];
    },
  });
}

function useAddLostFound() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async (input: {
      kind: "lost" | "found";
      title: string;
      description?: string;
      locationNote?: string;
      contactNote?: string;
    }) => {
      const parsed = parseInput(lostFoundSchema, input);
      if (!profile) throw new Error("Sign in required.");
      const { error } = await supabase.from("lost_found_items").insert({
        society_id: profile.society_id,
        created_by: profile.id,
        flat_id: profile.flat_id,
        kind: parsed.kind,
        title: parsed.title,
        description: parsed.description ?? null,
        location_note: parsed.locationNote ?? null,
        contact_note: parsed.contactNote ?? null,
      });
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["lost-found"] });
      qc.invalidateQueries({ queryKey: ["society-activity"] });
    },
  });
}

function useSetLostFoundStatus() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: "open" | "claimed" | "closed";
    }) => {
      const itemId = parseInput(uuidSchema, id);
      const { error } = await supabase
        .from("lost_found_items")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["lost-found"] }),
  });
}

export function LostFoundPanel() {
  const list = useLostFoundItems();
  const add = useAddLostFound();
  const setStatus = useSetLostFoundStatus();
  const myId = useSessionStore((s) => s.profile?.id);
  const [kind, setKind] = useState<"lost" | "found">("lost");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationNote, setLocationNote] = useState("");

  if (list.isLoading) return <Skeleton />;
  if (list.isError)
    return (
      <QueryErrorState
        error={list.error}
        onRetry={() => void list.refetch()}
        isRetrying={list.isRefetching}
      />
    );

  return (
    <>
      <Card className="gap-2">
        <Text className="text-title text-ink">Post an item</Text>
        <View className="flex-row flex-wrap gap-2">
          <Button
            title="Lost"
            variant={kind === "lost" ? "deny" : "ghost"}
            selected={kind === "lost"}
            onPress={() => setKind("lost")}
          />
          <Button
            title="Found"
            variant={kind === "found" ? "approve" : "ghost"}
            selected={kind === "found"}
            onPress={() => setKind("found")}
          />
        </View>
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="Blue umbrella" />
        <Field label="Details" value={description} onChangeText={setDescription} placeholder="Optional" />
        <Field label="Where" value={locationNote} onChangeText={setLocationNote} placeholder="Near clubhouse" />
        <Button
          title="Post"
          disabled={title.trim().length < 2}
          loading={add.isPending}
          onPress={() =>
            add.mutate(
              {
                kind,
                title: title.trim(),
                description: description.trim() || undefined,
                locationNote: locationNote.trim() || undefined,
              },
              {
                onSuccess: () => {
                  setTitle("");
                  setDescription("");
                  setLocationNote("");
                },
                onError: (e) =>
                  Alert.alert("Couldn’t post", e instanceof Error ? e.message : ""),
              },
            )
          }
        />
      </Card>

      {!list.data?.length ? (
        <EmptyState title="Nothing posted yet" hint="Lost something? Post it for neighbours." />
      ) : null}
      {list.data?.map((item) => (
        <Card key={item.id} className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text className="flex-1 text-title text-ink">{item.title}</Text>
            <Badge
              label={item.kind}
              tone={item.kind === "lost" ? "deny" : "approve"}
            />
          </View>
          {item.description ? (
            <Text className="text-body text-ink-soft">{item.description}</Text>
          ) : null}
          <Text className="text-caption text-ink-muted">
            {item.location_note ? `${item.location_note} · ` : ""}
            {format(new Date(item.created_at), "d MMM")} · {item.status}
          </Text>
          {item.created_by === myId && item.status === "open" ? (
            <View className="flex-row flex-wrap gap-2">
              <Button
                title="Mark claimed"
                variant="secondary"
                size="sm"
                onPress={() => setStatus.mutate({ id: item.id, status: "claimed" })}
              />
              <Button
                title="Close"
                variant="ghost"
                size="sm"
                onPress={() => setStatus.mutate({ id: item.id, status: "closed" })}
              />
            </View>
          ) : null}
        </Card>
      ))}
    </>
  );
}
