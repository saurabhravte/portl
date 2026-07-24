import { OfflineBanner } from "@/components/OfflineBanner";
import { Button, Card, Field, Screen } from "@/components/ui";
import { useRedeemAmenityAccess } from "@/features/community/hooks";
import { useCheckInDomesticHelper } from "@/features/domestic/hooks";
import { useVerifyCode } from "@/features/preapprovals/hooks";
import { useVerifyResidentId } from "@/features/residentId/hooks";
import { useT } from "@/lib/i18n";
import { reportMutationError } from "@/lib/queryState";
import { useIsOnline } from "@/lib/offline";
import { gateCodeSchema } from "@/lib/validation";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { format } from "date-fns";
import React, { useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

type ScanMode = "guest" | "amenity" | "resident" | "helper";

export default function CodeEntry() {
  const t = useT();
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [mode, setMode] = useState<ScanMode>("guest");
  const [permission, requestPermission] = useCameraPermissions();
  const verify = useVerifyCode();
  const redeemAmenity = useRedeemAmenityAccess();
  const verifyResident = useVerifyResidentId();
  const helperCheckIn = useCheckInDomesticHelper();
  const online = useIsOnline();
  const [lastOk, setLastOk] = useState<string | null>(null);
  const scanLock = useRef(false);

  const redeem = (raw: string) => {
    if (!online) {
      Alert.alert(
        "Code verification needs internet",
        "QR and code redemption are online-only so a pass cannot be used twice.",
      );
      scanLock.current = false;
      return;
    }

    if (mode === "resident") {
      verifyResident.mutate(raw.trim(), {
        onSuccess: (result) => {
          if (!result.ok) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert("Resident ID invalid", result.message ?? "Try again.");
            scanLock.current = false;
            return;
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setLastOk(
            `${result.name} · Flat ${result.flatNumber}${result.phone ? ` · ${result.phone}` : ""}`,
          );
          setCode("");
          setScanning(false);
          scanLock.current = false;
        },
        onError: (error) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert(
            "Resident ID failed",
            reportMutationError("verify-resident-id", error),
          );
          scanLock.current = false;
        },
      });
      return;
    }

    if (mode === "helper") {
      helperCheckIn.mutate(
        { code: raw.trim(), method: "qr" },
        {
          onSuccess: (result) => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setLastOk(
              `${result.helperName} (${result.role}) → Flat ${result.flatNumber ?? "—"}${
                result.alreadyIn ? " · already in" : " · checked in"
              }`,
            );
            setCode("");
            setScanning(false);
            scanLock.current = false;
          },
          onError: (error) => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert(
              "Helper check-in failed",
              reportMutationError("helper-check-in", error),
            );
            scanLock.current = false;
          },
        },
      );
      return;
    }

    const parsed = gateCodeSchema.safeParse(raw.trim());
    if (!parsed.success) {
      Alert.alert(t("six_digits"), t("six_digits_hint"));
      scanLock.current = false;
      return;
    }

    if (mode === "amenity") {
      redeemAmenity.mutate(parsed.data, {
        onSuccess: (result) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setLastOk(
            `${result.amenityName} · Flat ${result.flatNumber} · ${format(new Date(result.startsAt), "h:mm a")}`,
          );
          setCode("");
          setScanning(false);
          scanLock.current = false;
        },
        onError: (error) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert(
            "Amenity code invalid",
            reportMutationError("redeem-amenity-access", error),
          );
          scanLock.current = false;
        },
      });
      return;
    }

    verify.mutate(parsed.data, {
      onSuccess: (pa) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setLastOk(
          `${pa.visitor_name} → ${t("flat")} ${pa.flat_number}. ${t("entry_logged")}`,
        );
        setCode("");
        setScanning(false);
        scanLock.current = false;
      },
      onError: (error) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(t("not_valid"), reportMutationError("redeem-gate-code", error));
        scanLock.current = false;
      },
    });
  };

  const onScanPress = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert(t("camera_needed_title"), t("camera_needed_hint"));
        return;
      }
    }
    scanLock.current = false;
    setScanning(true);
  };

  const extractPayload = (data: string) => {
    const raw = String(data);
    if (mode === "resident") {
      const match = raw.toUpperCase().match(/R\d{8}/);
      return match ? match[0] : raw;
    }
    if (mode === "helper") {
      const match = raw.toUpperCase().match(/H\d{6}/);
      return match ? match[0] : raw;
    }
    const match = raw.match(/\d{6}/);
    return match ? match[0] : raw;
  };

  const modeHint =
    mode === "amenity"
      ? "Scan a resident’s amenity QR to check them in for their booked slot."
      : mode === "resident"
        ? "Scan a resident ID QR. This verifies identity and does not expire."
        : mode === "helper"
          ? "Scan a domestic-help QR to check them into their flat."
          : "Online-only: QR and code redemption must verify and burn the pass on the server before entry is logged.";

  const pending =
    verify.isPending ||
    redeemAmenity.isPending ||
    verifyResident.isPending ||
    helperCheckIn.isPending;

  return (
    <Screen className="gap-4 p-4">
      <OfflineBanner />
      <Text className="text-display text-ink">{t("have_code")}</Text>
      <View className="flex-row flex-wrap gap-2">
        {(
          [
            ["guest", "Guest pass"],
            ["amenity", "Amenity"],
            ["resident", "Resident ID"],
            ["helper", "Domestic help"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            title={label}
            variant={mode === key ? "primary" : "ghost"}
            selected={mode === key}
            onPress={() => setMode(key)}
          />
        ))}
      </View>
      <Card>
        <Text className="text-caption text-ink-muted">{modeHint}</Text>
      </Card>

      {scanning ? (
        <View className="h-72 w-full overflow-hidden rounded-lg">
          <CameraView
            style={{ flex: 1 }}
            mute
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => {
              if (scanLock.current) return;
              scanLock.current = true;
              redeem(extractPayload(data));
            }}
          />
          <Pressable
            onPress={() => setScanning(false)}
            className="absolute bottom-2 self-center rounded-pill bg-ink px-4 py-2"
          >
            <Text className="text-caption text-inverse">{t("cancel")}</Text>
          </Pressable>
        </View>
      ) : (
        <Button
          title={`▣ ${t("scan_qr")}`}
          variant="secondary"
          size="guard"
          onPress={onScanPress}
          disabled={!online}
        />
      )}

      <Text className="text-caption text-ink-muted">{t("type_code")}</Text>
      <Field
        value={code}
        onChangeText={setCode}
        autoCapitalize={mode === "guest" || mode === "amenity" ? "none" : "characters"}
        keyboardType={mode === "guest" || mode === "amenity" ? "number-pad" : "default"}
        maxLength={mode === "resident" ? 9 : mode === "helper" ? 7 : 6}
        placeholder={
          mode === "resident" ? "R••••••••" : mode === "helper" ? "H••••••" : "••••••"
        }
        className="min-h-[72px] text-center text-3xl tracking-[12px]"
      />
      <Button
        title={
          mode === "amenity"
            ? "Check in amenity"
            : mode === "resident"
              ? "Verify resident ID"
              : mode === "helper"
                ? "Check in helper"
                : t("verify_code")
        }
        size="guard"
        onPress={() => redeem(code)}
        loading={pending}
        disabled={!online}
      />
      {lastOk && (
        <Card className="border-approve bg-approve-bg">
          <Text className="text-title text-approve">✓ {lastOk}</Text>
        </Card>
      )}
    </Screen>
  );
}
