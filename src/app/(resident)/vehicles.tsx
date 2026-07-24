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
  useAddVehicle,
  useMyVehicles,
  useRemoveVehicle,
} from "@/features/vehicles/hooks";
import { useThemeColors } from "@/theme/useThemeColors";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, ScrollView, Switch, Text, View } from "react-native";

export default function ResidentVehicles() {
  const router = useRouter();
  const colors = useThemeColors();
  const { data, isLoading } = useMyVehicles();
  const add = useAddVehicle();
  const remove = useRemoveVehicle();

  const [plate, setPlate] = useState("");
  const [label, setLabel] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);

  const onAdd = () => {
    add.mutate(
      { plate, label: label || undefined, autoApprove },
      {
        onSuccess: () => {
          setPlate("");
          setLabel("");
          setAutoApprove(false);
        },
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
          <Text className="text-display text-ink">My vehicles</Text>
          <Text className="text-body text-ink-soft">
            Register plates so the guard can identify them. Auto-approve lets a
            registered vehicle in without a call.
          </Text>
        </View>

        <Card>
          <Field
            label="Number plate"
            placeholder="MH12AB1234"
            autoCapitalize="characters"
            value={plate}
            onChangeText={setPlate}
          />
          <Field
            label="Label (optional)"
            placeholder="My car"
            value={label}
            onChangeText={setLabel}
          />
          <View className="flex-row items-center justify-between py-1">
            <Text className="text-label text-ink">Auto-approve at gate</Text>
            <Switch
              value={autoApprove}
              onValueChange={setAutoApprove}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
          <Button
            title="Add vehicle"
            onPress={onAdd}
            loading={add.isPending}
            disabled={plate.trim().length < 3}
          />
        </Card>

        <SectionTitle>Registered</SectionTitle>
        {isLoading ? <Skeleton /> : null}
        {!isLoading && !data?.length ? (
          <EmptyState title="No vehicles yet" hint="Add a plate above." />
        ) : null}
        {data?.map((v) => (
          <Card key={v.id}>
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-title text-ink">{v.plate}</Text>
                {v.label ? (
                  <Text className="text-caption text-ink-soft">{v.label}</Text>
                ) : null}
              </View>
              {v.auto_approve ? <Badge label="Auto-approve" tone="approve" /> : null}
            </View>
            <Button
              title="Remove"
              size="sm"
              variant="deny-outline"
              loading={remove.isPending}
              onPress={() => remove.mutate(v.id)}
            />
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
