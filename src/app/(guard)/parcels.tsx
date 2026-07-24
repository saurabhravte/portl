import {
  BackControl,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Screen,
  SectionTitle,
  Skeleton,
} from "@/components/ui";
import {
  useLogParcel,
  useMarkParcelCollected,
  useParcels,
} from "@/features/parcels/hooks";
import { useResidentSearch } from "@/features/visitors/hooks";
import { format } from "date-fns";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

export default function GuardParcels() {
  const router = useRouter();
  const pending = useParcels("pending");
  const log = useLogParcel();
  const collect = useMarkParcelCollected();

  const [term, setTerm] = useState("");
  const [flat, setFlat] = useState<{ id: string; label: string } | null>(null);
  const [description, setDescription] = useState("");
  const [shelf, setShelf] = useState("");
  const results = useResidentSearch(term);

  const onLog = () => {
    if (!flat) {
      Alert.alert("Pick a flat", "Search and select the resident/flat first.");
      return;
    }
    log.mutate(
      { flatId: flat.id, description, shelfLabel: shelf || undefined },
      {
        onSuccess: () => {
          setDescription("");
          setShelf("");
          setFlat(null);
          setTerm("");
          Alert.alert("Logged", "The resident has been notified.");
        },
        onError: (e) => Alert.alert("Couldn't log", e instanceof Error ? e.message : ""),
      },
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 p-4 pb-8">
        <BackControl onPress={() => router.back()} />
        <Text className="text-display text-ink">Packages at gate</Text>

        <Card>
          <SectionTitle>Log a package</SectionTitle>
          {flat ? (
            <View className="flex-row items-center justify-between">
              <Text className="text-body text-ink">For: {flat.label}</Text>
              <Button title="Change" size="sm" variant="ghost" onPress={() => setFlat(null)} />
            </View>
          ) : (
            <>
              <Field
                label="Resident / flat"
                placeholder="Search name…"
                value={term}
                onChangeText={setTerm}
              />
              {results.data?.map((r) => {
                const tower = (r.flat as any)?.tower?.name;
                const number = (r.flat as any)?.number;
                const label = `${r.name} · ${tower ? tower + " " : ""}Flat ${number}`;
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => (r.flat as any)?.id && setFlat({ id: (r.flat as any).id, label })}
                    className="rounded-md bg-surface-alt p-3 active:opacity-70"
                  >
                    <Text className="text-body text-ink">{label}</Text>
                  </Pressable>
                );
              })}
            </>
          )}
          <Field label="Description" placeholder="Amazon box" value={description} onChangeText={setDescription} />
          <Field label="Shelf (optional)" placeholder="B2" value={shelf} onChangeText={setShelf} />
          <Button
            title="Log package"
            size="guard"
            onPress={onLog}
            loading={log.isPending}
            disabled={!flat || description.trim().length < 1}
          />
        </Card>

        <SectionTitle>Awaiting collection</SectionTitle>
        {pending.isLoading ? <Skeleton /> : null}
        {!pending.isLoading && !pending.data?.length ? (
          <EmptyState title="Nothing waiting" />
        ) : null}
        {pending.data?.map((p) => (
          <Card key={p.id}>
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-title text-ink">{p.description}</Text>
                <Text className="text-caption text-ink-soft">
                  {p.flat?.number ? `Flat ${p.flat.number} · ` : ""}
                  {p.shelf_label ? `Shelf ${p.shelf_label} · ` : ""}
                  {format(new Date(p.created_at), "d MMM, h:mm a")}
                </Text>
              </View>
              <Badge label="At gate" tone="warn" />
            </View>
            <Button
              title="Handed over"
              size="sm"
              variant="secondary"
              loading={collect.isPending}
              onPress={() => collect.mutate(p.id)}
            />
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
