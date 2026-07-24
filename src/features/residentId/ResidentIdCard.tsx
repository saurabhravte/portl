import {
  Badge,
  Button,
  Card,
  QueryErrorState,
  SectionTitle,
  Skeleton,
} from "@/components/ui";
import {
  residentIdQrValue,
  useMyResidentId,
} from "@/features/residentId/hooks";
import { useMyFlatLabel } from "@/features/community/useMyFlatLabel";
import { useSessionStore } from "@/stores/session";
import { color } from "@/theme/tokens";
import React from "react";
import { Share, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

export function ResidentIdCard() {
  const profile = useSessionStore((s) => s.profile);
  const id = useMyResidentId();
  const flatLabel = useMyFlatLabel();
  const flatText = flatLabel.data;

  if (id.isLoading) return <Skeleton height={180} />;
  if (id.isError)
    return (
      <QueryErrorState
        error={id.error}
        onRetry={() => void id.refetch()}
        isRetrying={id.isRefetching}
        title="Couldn’t load resident ID"
      />
    );
  if (!id.data) return null;

  const qrValue = residentIdQrValue(id.data);

  return (
    <Card className="items-center gap-3">
      <SectionTitle>Digital resident ID</SectionTitle>
      <Text className="text-center text-caption text-ink-muted">
        Show this QR at the gate. It identifies you — it is not a one-time guest pass.
      </Text>
      <View className="rounded-lg bg-paper p-3">
        <QRCode value={qrValue} size={160} color={color.ink} backgroundColor={color.paper} />
      </View>
      <Text className="text-title tracking-widest text-ink">{id.data}</Text>
      <Text className="text-body text-ink-soft">
        {profile?.name}
        {flatText ? ` · ${flatText}` : ""}
      </Text>
      <Badge label="Non-expiring ID" tone="approve" />
      <Button
        title="Share ID code"
        variant="ghost"
        onPress={() =>
          void Share.share({
            message: `My Portl resident ID: ${id.data}`,
          })
        }
      />
    </Card>
  );
}
