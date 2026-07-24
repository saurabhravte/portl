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
  useCreateGroupPass,
  useGroupPasses,
} from "@/features/groupPasses/hooks";
import { sharePass } from "@/features/preapprovals/share";
import { format } from "date-fns";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";

export default function ResidentGroupPass() {
  const router = useRouter();
  const { data, isLoading } = useGroupPasses();
  const create = useCreateGroupPass();

  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState("10");
  const [hours, setHours] = useState("12");

  const onCreate = () => {
    const uses = Number.parseInt(maxUses, 10);
    const dur = Number.parseInt(hours, 10);
    if (Number.isNaN(uses) || uses < 1 || Number.isNaN(dur) || dur < 1) {
      Alert.alert("Check details", "Enter a guest count and how many hours it stays valid.");
      return;
    }
    const from = new Date();
    const to = new Date(from.getTime() + dur * 60 * 60 * 1000);
    create.mutate(
      { label, type: "guest", maxUses: uses, validFrom: from, validTo: to },
      {
        onSuccess: (pass) => {
          setLabel("");
          Alert.alert(
            "Group pass created",
            `Code ${pass.code} — admits up to ${pass.max_uses} guests.`,
            [
              { text: "OK" },
              { text: "Share", onPress: () => void sharePass({ code: pass.code, label: pass.label }) },
            ],
          );
        },
        onError: (e) => Alert.alert("Couldn't create", e instanceof Error ? e.message : ""),
      },
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 p-4 pb-8">
        <BackControl onPress={() => router.back()} />
        <View>
          <Text className="text-display text-ink">Group & event passes</Text>
          <Text className="text-body text-ink-soft">
            One shareable code that admits a whole guest list — a party, a
            function, or movers. Share the link; the guard scans each guest in.
          </Text>
        </View>

        <Card>
          <Field label="Occasion" placeholder="Birthday party" value={label} onChangeText={setLabel} />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="Max guests" keyboardType="number-pad" value={maxUses} onChangeText={setMaxUses} />
            </View>
            <View className="flex-1">
              <Field label="Valid (hours)" keyboardType="number-pad" value={hours} onChangeText={setHours} />
            </View>
          </View>
          <Button
            title="Create group pass"
            onPress={onCreate}
            loading={create.isPending}
            disabled={label.trim().length < 1}
          />
        </Card>

        <SectionTitle>Your passes</SectionTitle>
        {isLoading ? <Skeleton /> : null}
        {!isLoading && !data?.length ? (
          <EmptyState title="No group passes" hint="Create one above." />
        ) : null}
        {data?.map((g) => {
          const expired = new Date(g.valid_to) < new Date();
          const full = g.uses >= g.max_uses;
          return (
            <Card key={g.id}>
              <View className="flex-row items-center justify-between">
                <Text className="text-title text-ink">{g.label}</Text>
                <Badge
                  label={expired ? "Expired" : full ? "Full" : `${g.uses}/${g.max_uses} used`}
                  tone={expired || full ? "neutral" : "primary"}
                />
              </View>
              <Text className="text-caption text-ink-soft">
                Code {g.code} · until {format(new Date(g.valid_to), "d MMM, h:mm a")}
              </Text>
              <Button
                title="Share"
                size="sm"
                variant="secondary"
                onPress={() => void sharePass({ code: g.code, label: g.label })}
              />
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
