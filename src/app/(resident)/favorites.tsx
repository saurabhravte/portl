import {
  BackControl,
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Screen,
  SectionTitle,
  Skeleton,
} from "@/components/ui";
import {
  useAddFavoriteVisitor,
  useFavoriteVisitors,
  useRemoveFavoriteVisitor,
} from "@/features/favorites/hooks";
import type { VisitorType } from "@/features/visitors/hooks";
import { useCreatePreApproval } from "@/features/preapprovals/hooks";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";

const TYPES: { key: VisitorType; label: string }[] = [
  { key: "guest", label: "Guest" },
  { key: "delivery", label: "Delivery" },
  { key: "cab", label: "Cab" },
  { key: "service", label: "Service" },
];

export default function ResidentFavorites() {
  const router = useRouter();
  const { data, isLoading } = useFavoriteVisitors();
  const add = useAddFavoriteVisitor();
  const remove = useRemoveFavoriteVisitor();
  const invite = useCreatePreApproval();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState<VisitorType>("guest");

  const onAdd = () => {
    add.mutate(
      { name, type, phone: phone || undefined },
      {
        onSuccess: () => {
          setName("");
          setPhone("");
          setType("guest");
        },
        onError: (e) =>
          Alert.alert("Couldn't add", e instanceof Error ? e.message : ""),
      },
    );
  };

  const inviteAgain = (favName: string, favType: VisitorType) => {
    const now = new Date();
    const to = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    invite.mutate(
      { visitorName: favName, type: favType, validFrom: now, validTo: to },
      {
        onSuccess: (pass) =>
          Alert.alert(
            "Pass created",
            `Gate code ${pass.code} for ${favName}, valid 24 hours.`,
          ),
        onError: (e) =>
          Alert.alert("Couldn't invite", e instanceof Error ? e.message : ""),
      },
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 p-4 pb-8">
        <BackControl onPress={() => router.back()} />
        <View>
          <Text className="text-display text-ink">Favorites</Text>
          <Text className="text-body text-ink-soft">
            Save people you invite often, then create a pass for them in one tap.
          </Text>
        </View>

        <Card>
          <Field label="Name" placeholder="Ramesh (driver)" value={name} onChangeText={setName} />
          <Field
            label="Phone (optional)"
            placeholder="+9198…"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <View className="flex-row flex-wrap gap-2">
            {TYPES.map((t) => (
              <Chip
                key={t.key}
                label={t.label}
                selected={type === t.key}
                onPress={() => setType(t.key)}
              />
            ))}
          </View>
          <Button
            title="Save favorite"
            onPress={onAdd}
            loading={add.isPending}
            disabled={name.trim().length < 1}
          />
        </Card>

        <SectionTitle>Saved</SectionTitle>
        {isLoading ? <Skeleton /> : null}
        {!isLoading && !data?.length ? (
          <EmptyState title="No favorites yet" hint="Save someone above." />
        ) : null}
        {data?.map((f) => (
          <Card key={f.id}>
            <Text className="text-title text-ink">{f.name}</Text>
            <Text className="text-caption text-ink-soft">
              {TYPES.find((t) => t.key === f.type)?.label}
              {f.phone ? ` · ${f.phone}` : ""}
            </Text>
            <View className="flex-row gap-2">
              <Button
                title="Invite again"
                size="sm"
                loading={invite.isPending}
                onPress={() => inviteAgain(f.name, f.type)}
                className="flex-1"
              />
              <Button
                title="Remove"
                size="sm"
                variant="deny-outline"
                loading={remove.isPending}
                onPress={() => remove.mutate(f.id)}
              />
            </View>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
