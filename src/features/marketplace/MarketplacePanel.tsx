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
  marketplaceListingSchema,
  parseInput,
  uuidSchema,
} from "@/lib/validation";
import { useSessionStore } from "@/stores/session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import React, { useState } from "react";
import { Alert, Text, View } from "react-native";

export interface MarketplaceRow {
  id: string;
  title: string;
  description: string | null;
  category: string;
  price: number | null;
  status: "active" | "sold" | "removed";
  created_at: string;
  created_by: string;
}

function useMarketplaceListings() {
  const supabase = useSupabase();
  const societyId = useSessionStore((s) => s.profile?.society_id);
  return useQuery({
    queryKey: ["marketplace", societyId],
    enabled: !!societyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketplace_listings")
        .select("id,title,description,category,price,status,created_at,created_by")
        .neq("status", "removed")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as MarketplaceRow[];
    },
  });
}

function useAddListing() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const profile = useSessionStore((s) => s.profile);
  return useMutation({
    mutationFn: async (input: {
      title: string;
      description?: string;
      category?: "general" | "furniture" | "electronics" | "services" | "other";
      price?: number | null;
    }) => {
      const parsed = parseInput(marketplaceListingSchema, input);
      if (!profile) throw new Error("Sign in required.");
      const { error } = await supabase.from("marketplace_listings").insert({
        society_id: profile.society_id,
        created_by: profile.id,
        flat_id: profile.flat_id,
        title: parsed.title,
        description: parsed.description ?? null,
        category: parsed.category,
        price: parsed.price ?? null,
      });
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["marketplace"] });
      qc.invalidateQueries({ queryKey: ["society-activity"] });
    },
  });
}

function useSetListingStatus() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: "active" | "sold" | "removed";
    }) => {
      const listingId = parseInput(uuidSchema, id);
      const { error } = await supabase
        .from("marketplace_listings")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", listingId);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["marketplace"] }),
  });
}

export function MarketplacePanel() {
  const list = useMarketplaceListings();
  const add = useAddListing();
  const setStatus = useSetListingStatus();
  const myId = useSessionStore((s) => s.profile?.id);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState<
    "general" | "furniture" | "electronics" | "services" | "other"
  >("general");

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
        <Text className="text-title text-ink">List an item</Text>
        <Field label="Title" value={title} onChangeText={setTitle} />
        <Field label="Details" value={description} onChangeText={setDescription} />
        <Field
          label="Price (₹, blank = free/negotiable)"
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
        />
        <View className="flex-row flex-wrap gap-2">
          {(["general", "furniture", "electronics", "services", "other"] as const).map((c) => (
            <Button
              key={c}
              title={c}
              size="sm"
              variant={category === c ? "primary" : "ghost"}
              selected={category === c}
              onPress={() => setCategory(c)}
            />
          ))}
        </View>
        <Button
          title="Publish listing"
          disabled={title.trim().length < 2}
          loading={add.isPending}
          onPress={() =>
            add.mutate(
              {
                title: title.trim(),
                description: description.trim() || undefined,
                category,
                price: price.trim() ? Number(price) : null,
              },
              {
                onSuccess: () => {
                  setTitle("");
                  setDescription("");
                  setPrice("");
                },
                onError: (e) =>
                  Alert.alert("Couldn’t list", e instanceof Error ? e.message : ""),
              },
            )
          }
        />
      </Card>

      {!list.data?.length ? <EmptyState title="No listings yet" /> : null}
      {list.data?.map((item) => (
        <Card key={item.id} className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text className="flex-1 text-title text-ink">{item.title}</Text>
            <Badge label={item.status} tone={item.status === "active" ? "approve" : "neutral"} />
          </View>
          <Text className="text-body text-ink-soft">
            {item.price == null ? "Free / negotiable" : `₹${item.price}`} · {item.category}
          </Text>
          {item.description ? (
            <Text className="text-caption text-ink-muted">{item.description}</Text>
          ) : null}
          <Text className="text-caption text-ink-muted">
            {format(new Date(item.created_at), "d MMM")}
          </Text>
          {item.created_by === myId && item.status === "active" ? (
            <View className="flex-row flex-wrap gap-2">
              <Button
                title="Mark sold"
                variant="secondary"
                size="sm"
                onPress={() => setStatus.mutate({ id: item.id, status: "sold" })}
              />
              <Button
                title="Remove"
                variant="ghost"
                size="sm"
                onPress={() => setStatus.mutate({ id: item.id, status: "removed" })}
              />
            </View>
          ) : null}
        </Card>
      ))}
    </>
  );
}
