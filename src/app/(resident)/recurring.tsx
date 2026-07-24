import {
  BackControl,
  Badge,
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
  useAddRecurringPass,
  useRecurringPasses,
  useRemoveRecurringPass,
} from "@/features/recurring/hooks";
import type { VisitorType } from "@/features/visitors/hooks";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TYPES: { key: VisitorType; label: string }[] = [
  { key: "service", label: "Service" },
  { key: "guest", label: "Guest" },
  { key: "delivery", label: "Delivery" },
  { key: "cab", label: "Cab" },
];

function hhmm(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export default function ResidentRecurring() {
  const router = useRouter();
  const { data, isLoading } = useRecurringPasses();
  const add = useAddRecurringPass();
  const remove = useRemoveRecurringPass();

  const [name, setName] = useState("");
  const [type, setType] = useState<VisitorType>("service");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [startHour, setStartHour] = useState("9");
  const [endHour, setEndHour] = useState("11");

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const onAdd = () => {
    const sh = Number.parseInt(startHour, 10);
    const eh = Number.parseInt(endHour, 10);
    if (Number.isNaN(sh) || Number.isNaN(eh) || eh <= sh) {
      Alert.alert("Check times", "Enter start/end hours (0–24), end after start.");
      return;
    }
    add.mutate(
      {
        name,
        type,
        daysOfWeek: days,
        startMinute: sh * 60,
        endMinute: eh * 60,
      },
      {
        onSuccess: () => setName(""),
        onError: (e) =>
          Alert.alert("Couldn't add", e instanceof Error ? e.message : ""),
      },
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 p-4 pb-8">
        <BackControl onPress={() => router.back()} />
        <View>
          <Text className="text-display text-ink">Recurring passes</Text>
          <Text className="text-body text-ink-soft">
            For regular help like a maid or cook. Guards see a match during the
            window so entry is quick.
          </Text>
        </View>

        <Card>
          <Field label="Name" placeholder="Sunita (maid)" value={name} onChangeText={setName} />
          <View className="flex-row flex-wrap gap-2">
            {TYPES.map((t) => (
              <Chip key={t.key} label={t.label} selected={type === t.key} onPress={() => setType(t.key)} />
            ))}
          </View>
          <Text className="text-label text-ink">Days</Text>
          <View className="flex-row flex-wrap gap-2">
            {DAYS.map((d, i) => (
              <Chip key={d} label={d} selected={days.includes(i)} onPress={() => toggleDay(i)} />
            ))}
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="From (hour)" keyboardType="number-pad" value={startHour} onChangeText={setStartHour} />
            </View>
            <View className="flex-1">
              <Field label="To (hour)" keyboardType="number-pad" value={endHour} onChangeText={setEndHour} />
            </View>
          </View>
          <Button
            title="Add recurring pass"
            onPress={onAdd}
            loading={add.isPending}
            disabled={name.trim().length < 1 || days.length === 0}
          />
        </Card>

        <SectionTitle>Active</SectionTitle>
        {isLoading ? <Skeleton /> : null}
        {!isLoading && !data?.length ? (
          <EmptyState title="No recurring passes" hint="Add one above." />
        ) : null}
        {data?.map((p) => (
          <Card key={p.id}>
            <View className="flex-row items-center justify-between">
              <Text className="text-title text-ink">{p.name}</Text>
              <Badge label={p.active ? "Active" : "Off"} tone={p.active ? "approve" : "neutral"} />
            </View>
            <Text className="text-caption text-ink-soft">
              {p.days_of_week.map((d) => DAYS[d]).join(", ")} · {hhmm(p.start_minute)}–{hhmm(p.end_minute)}
            </Text>
            <Button
              title="Remove"
              size="sm"
              variant="deny-outline"
              loading={remove.isPending}
              onPress={() => remove.mutate(p.id)}
            />
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
