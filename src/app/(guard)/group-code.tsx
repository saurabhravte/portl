import {
  BackControl,
  Button,
  Card,
  Field,
  Screen,
} from "@/components/ui";
import { useRedeemGroupCode } from "@/features/groupPasses/hooks";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";

export default function GuardGroupCode() {
  const router = useRouter();
  const redeem = useRedeemGroupCode();
  const [code, setCode] = useState("");
  const [guest, setGuest] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);

  const onRedeem = () => {
    redeem.mutate(
      { code, guestName: guest || undefined },
      {
        onSuccess: (r) => {
          setRemaining(r.remaining ?? null);
          setGuest("");
          Alert.alert(
            "Admitted",
            `${r.visitor_name} · Flat ${r.flat_number}\n${r.remaining ?? 0} guests remaining on this pass.`,
          );
        },
        onError: (e) => Alert.alert("Not admitted", e instanceof Error ? e.message : ""),
      },
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 p-4 pb-8">
        <BackControl onPress={() => router.back()} />
        <View>
          <Text className="text-display text-ink">Group / event code</Text>
          <Text className="text-body text-ink-soft">
            Admit each guest of a party or event against the shared code.
          </Text>
        </View>
        <Card>
          <Field
            label="Group code"
            placeholder="ABCD2345"
            autoCapitalize="characters"
            value={code}
            onChangeText={setCode}
          />
          <Field
            label="Guest name (optional)"
            placeholder="Guest"
            value={guest}
            onChangeText={setGuest}
          />
          <Button
            title="Admit guest"
            size="guard"
            onPress={onRedeem}
            loading={redeem.isPending}
            disabled={code.trim().length < 6}
          />
          {remaining !== null ? (
            <Text className="text-caption text-ink-soft">
              Last pass: {remaining} guests remaining.
            </Text>
          ) : null}
        </Card>
      </ScrollView>
    </Screen>
  );
}
