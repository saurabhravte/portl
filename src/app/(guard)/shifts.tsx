import { Badge, Button, Card, EmptyState, Field, QueryErrorState, Screen, SectionTitle, Skeleton } from "@/components/ui";
import { GuardsOnDutyPanel } from "@/features/guards/GuardsOnDutyPanel";
import { SosButton } from "@/features/safety/SosButton";
import { useGuardShifts, useUpdateMyGuardShift } from "@/features/guards/hooks";
import { format } from "date-fns";
import React, { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";

export default function GuardShifts() {
  const shifts = useGuardShifts();
  const update = useUpdateMyGuardShift();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const checkOut = (shiftId: string) => {
    const note = (notes[shiftId] ?? "").trim();
    if (!note) {
      Alert.alert("Handover note", "Leave a short note for the next guard before checking out.");
      return;
    }
    update.mutate({ shiftId, status: "completed", handoverNote: note });
  };

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-3 p-4 pb-8">
        <Text className="text-display text-ink">My shifts</Text>
        <SosButton kind="panic" />
        {shifts.isLoading ? <Skeleton /> : null}
        {shifts.isError ? <QueryErrorState error={shifts.error} onRetry={() => void shifts.refetch()} /> : null}
        {!shifts.data?.length ? <EmptyState title="No scheduled shifts" /> : null}
        {shifts.data?.map((shift) => (
          <Card key={shift.id}>
            <View className="flex-row items-center justify-between">
              <Text className="text-title text-ink">{shift.gate?.name ?? "Gate to be assigned"}</Text>
              <Badge label={shift.status.replace("_", " ")} tone={shift.status === "checked_in" ? "approve" : "neutral"} />
            </View>
            <Text className="text-body text-ink-soft">
              {format(new Date(shift.starts_at), "d MMM, h:mm a")}–{format(new Date(shift.ends_at), "h:mm a")}
            </Text>
            {shift.status === "scheduled" ? (
              <Button title="Check in" size="guard" loading={update.isPending} onPress={() => update.mutate({ shiftId: shift.id, status: "checked_in" })} />
            ) : null}
            {shift.status === "checked_in" ? (
              <>
                <Field
                  label="Handover note for next guard"
                  value={notes[shift.id] ?? ""}
                  onChangeText={(text) => setNotes((prev) => ({ ...prev, [shift.id]: text }))}
                  placeholder="Parcel shelf full; watchlist alert on gate cam 2…"
                  multiline
                />
                <Button
                  title="Check out"
                  size="guard"
                  variant="secondary"
                  loading={update.isPending}
                  onPress={() => checkOut(shift.id)}
                />
              </>
            ) : null}
          </Card>
        ))}

        <View className="mt-4">
          <SectionTitle>Currently on duty</SectionTitle>
          <GuardsOnDutyPanel />
        </View>
      </ScrollView>
    </Screen>
  );
}
