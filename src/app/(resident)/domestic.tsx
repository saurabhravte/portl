import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  QueryErrorState,
  Screen,
  SectionTitle,
  Skeleton,
} from "@/components/ui";
import {
  helperCheckinQrValue,
  useAddDomesticHelper,
  useCheckInDomesticHelper,
  useCheckOutDomesticHelper,
  useDomesticHelpers,
  useDomesticOnDuty,
  useSetDomesticHelperActive,
} from "@/features/domestic/hooks";
import { color } from "@/theme/tokens";
import { format } from "date-fns";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, ScrollView, Share, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

export default function DomesticHelpRoute() {
  const router = useRouter();
  const helpers = useDomesticHelpers();
  const onDuty = useDomesticOnDuty();
  const add = useAddDomesticHelper();
  const setActive = useSetDomesticHelperActive();
  const checkIn = useCheckInDomesticHelper();
  const checkOut = useCheckOutDomesticHelper();
  const [name, setName] = useState("");
  const [role, setRole] = useState<"maid" | "cook" | "driver" | "other">("maid");
  const [showCodeFor, setShowCodeFor] = useState<string | null>(null);

  return (
    <Screen>
      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="gap-3 p-4 pb-10">
          <Button title="← Profile" variant="ghost" onPress={() => router.back()} />
          <Text accessibilityRole="header" className="text-display text-ink">
            Domestic help
          </Text>
          <Text className="text-body text-ink-soft">
            Register maids, cooks, and drivers. Guards can scan their QR to check them in.
          </Text>

          <Card className="gap-2">
            <SectionTitle>Add helper</SectionTitle>
            <Field label="Name" value={name} onChangeText={setName} placeholder="Sunita" />
            <View className="flex-row flex-wrap gap-2">
              {(["maid", "cook", "driver", "other"] as const).map((r) => (
                <Button
                  key={r}
                  title={r}
                  size="sm"
                  variant={role === r ? "primary" : "ghost"}
                  selected={role === r}
                  onPress={() => setRole(r)}
                />
              ))}
            </View>
            <Button
              title="Save helper"
              disabled={name.trim().length < 2}
              loading={add.isPending}
              onPress={() =>
                add.mutate(
                  { name: name.trim(), role },
                  {
                    onSuccess: () => setName(""),
                    onError: (e) =>
                      Alert.alert("Couldn’t save", e instanceof Error ? e.message : ""),
                  },
                )
              }
            />
          </Card>

          <SectionTitle>Inside now</SectionTitle>
          {onDuty.isLoading ? <Skeleton /> : null}
          {onDuty.isError ? (
            <QueryErrorState error={onDuty.error} onRetry={() => void onDuty.refetch()} />
          ) : null}
          {!onDuty.data?.length ? <EmptyState title="Nobody checked in" /> : null}
          {onDuty.data?.map((row) => (
            <Card key={row.attendanceId}>
              <Text className="text-title text-ink">{row.helperName}</Text>
              <Text className="text-caption text-ink-muted">
                {row.role} · since {format(new Date(row.checkedInAt), "h:mm a")}
              </Text>
              <Button
                title="Check out"
                variant="secondary"
                loading={checkOut.isPending}
                onPress={() => checkOut.mutate(row.attendanceId)}
              />
            </Card>
          ))}

          <SectionTitle>Your helpers</SectionTitle>
          {helpers.isLoading ? <Skeleton /> : null}
          {helpers.isError ? (
            <QueryErrorState error={helpers.error} onRetry={() => void helpers.refetch()} />
          ) : null}
          {!helpers.data?.length ? <EmptyState title="No helpers registered" /> : null}
          {helpers.data?.map((helper) => (
            <Card key={helper.id} className="gap-2">
              <View className="flex-row items-center justify-between">
                <Text className="text-title text-ink">{helper.name}</Text>
                <Badge
                  label={helper.is_active ? helper.role : "Inactive"}
                  tone={helper.is_active ? "approve" : "neutral"}
                />
              </View>
              <Text className="text-caption text-ink-muted">{helper.checkin_code}</Text>
              {showCodeFor === helper.id ? (
                <View className="items-center gap-2">
                  <QRCode
                    value={helperCheckinQrValue(helper.checkin_code)}
                    size={140}
                    color={color.ink}
                    backgroundColor={color.paper}
                  />
                  <Button
                    title="Share code"
                    variant="ghost"
                    onPress={() =>
                      void Share.share({
                        message: `${helper.name} check-in code: ${helper.checkin_code}`,
                      })
                    }
                  />
                </View>
              ) : null}
              <View className="flex-row flex-wrap gap-2">
                <Button
                  title={showCodeFor === helper.id ? "Hide QR" : "Show QR"}
                  variant="ghost"
                  size="sm"
                  onPress={() =>
                    setShowCodeFor((id) => (id === helper.id ? null : helper.id))
                  }
                />
                {helper.is_active ? (
                  <Button
                    title="Check in now"
                    size="sm"
                    loading={checkIn.isPending}
                    onPress={() =>
                      checkIn.mutate(
                        { helperId: helper.id, method: "manual" },
                        {
                          onSuccess: (r) =>
                            Alert.alert(
                              r.alreadyIn ? "Already in" : "Checked in",
                              r.helperName,
                            ),
                          onError: (e) =>
                            Alert.alert(
                              "Check-in failed",
                              e instanceof Error ? e.message : "",
                            ),
                        },
                      )
                    }
                  />
                ) : null}
                <Button
                  title={helper.is_active ? "Deactivate" : "Reactivate"}
                  variant="ghost"
                  size="sm"
                  onPress={() =>
                    setActive.mutate({ id: helper.id, isActive: !helper.is_active })
                  }
                />
              </View>
            </Card>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
