import { AppIcon } from "@/components/ui";
import type { ReceiptData } from "@/features/payments/receipt";
import { downloadReceiptPdf } from "@/features/payments/receiptPdf";
import { formatMoney } from "@/lib/money";
import { useThemeColors } from "@/theme/useThemeColors";
import React, { useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

const CARD_MAX_WIDTH = 360;

function TicketNotch({ side }: { side: "left" | "right" }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: -10,
        [side]: -10,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: "rgba(15, 18, 34, 0.45)",
        zIndex: 2,
      }}
    />
  );
}

function DashedDivider({ color, width }: { color: string; width?: number }) {
  const w = width ?? Dimensions.get("window").width;
  const dash = 6;
  const gap = 5;
  const count = Math.ceil(w / (dash + gap));
  return (
    <Svg width={w} height={2}>
      {Array.from({ length: count }).map((_, i) => (
        <Path
          key={i}
          d={`M${i * (dash + gap)} 1 H${i * (dash + gap) + dash}`}
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      ))}
    </Svg>
  );
}

function ScallopedEdge({ width, fill }: { width: number; fill: string }) {
  const radius = 7;
  const count = Math.max(10, Math.floor(width / (radius * 2)));
  const step = width / count;
  const parts = [`M0,0`];
  for (let i = 0; i < count; i += 1) {
    const x0 = i * step;
    const x1 = (i + 1) * step;
    const mid = (x0 + x1) / 2;
    parts.push(`L${x0},0 Q${mid},${radius * 2} ${x1},0`);
  }
  parts.push(`L${width},0 L${width},${radius * 2 + 2} L0,${radius * 2 + 2} Z`);

  return (
    <Svg width={width} height={radius * 2 + 2}>
      <Path d={parts.join(" ")} fill={fill} />
    </Svg>
  );
}

function ReceiptSuccessGlyph() {
  const colors = useThemeColors();
  return (
    <Svg width={72} height={72} viewBox="0 0 72 72">
      <Path
        d="M24 12h22a4 4 0 0 1 4 4v36c0 1-.4 1.9-1.1 2.5l-2.9 2.2-2.9-2.2-2.9 2.2-2.9-2.2-2.9 2.2-2.9-2.2-2.9 2.2-2.9-2.2A4 4 0 0 1 20 52V16a4 4 0 0 1 4-4z"
        fill={colors.primarySoft}
        stroke={colors.primary}
        strokeWidth={2}
      />
      <Path
        d="M28 12h22a4 4 0 0 1 4 4v36c0 1-.4 1.9-1.1 2.5l-2.9 2.2-2.9-2.2-2.9 2.2-2.9-2.2-2.9 2.2-2.9-2.2-2.9 2.2-2.9-2.2A4 4 0 0 1 24 52V16a4 4 0 0 1 4-4z"
        fill={colors.surface}
        stroke={colors.primary}
        strokeWidth={2}
        opacity={0.95}
      />
      <Path
        d="M32 26h18M32 34h14M32 42h10"
        stroke={colors.primary}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Circle cx={50} cy={50} r={11} fill={colors.approve} />
      <Path
        d="M45.5 50.2l3 3 6.5-6.5"
        stroke="#FFFFFF"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function DetailRow({
  label,
  value,
  valueNode,
}: {
  label: string;
  value?: string;
  valueNode?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center py-1.5">
      <Text className="w-[42%] text-caption text-ink-muted">{label}</Text>
      <Text className="w-3 text-caption text-ink-faint">:</Text>
      <View className="flex-1 items-end">
        {valueNode ?? (
          <Text className="text-right text-caption font-semibold text-ink">
            {value}
          </Text>
        )}
      </View>
    </View>
  );
}

function ProductRow({ label, amount }: { label: string; amount: string }) {
  return (
    <View className="flex-row items-center justify-between py-1.5">
      <Text className="flex-1 pr-3 text-caption text-ink-muted">{label}</Text>
      <Text className="text-caption font-semibold text-ink">{amount}</Text>
    </View>
  );
}

export function PaymentSuccessReceipt({
  visible,
  receipt,
  onClose,
}: {
  visible: boolean;
  receipt: ReceiptData | null;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const [downloading, setDownloading] = useState(false);
  const screenW = Dimensions.get("window").width;
  const cardW = Math.min(CARD_MAX_WIDTH, screenW - 40);

  if (!receipt) return null;

  const amountLabel = formatMoney(receipt.amount);
  const productLabel = receipt.flatNumber
    ? `${receipt.period} Maintenance · Flat ${receipt.flatNumber}`
    : `${receipt.period} Maintenance`;

  const onDownload = async () => {
    setDownloading(true);
    try {
      await downloadReceiptPdf(receipt);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        className="flex-1 items-center justify-center px-5"
        style={{ backgroundColor: "rgba(15, 18, 34, 0.45)" }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss receipt"
          className="absolute inset-0"
          onPress={onClose}
        />

        <View style={{ width: cardW }}>
          <View
            className="overflow-hidden rounded-t-2xl"
            style={{ backgroundColor: colors.surface }}
          >
            <View className="px-5 pb-2 pt-4">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={onClose}
                hitSlop={12}
                className="absolute right-4 top-4 z-10 p-1 active:opacity-60"
              >
                <AppIcon name="close" size={20} color={colors.inkMuted} />
              </Pressable>

              <View className="items-center pt-2">
                <ReceiptSuccessGlyph />
                <Text className="mt-3 text-center text-title text-ink">
                  Payment Successful
                </Text>
                {receipt.societyName ? (
                  <Text className="mt-1 text-center text-caption text-ink-muted">
                    {receipt.societyName}
                  </Text>
                ) : null}
              </View>
            </View>

            <View className="relative my-3 px-4">
              <TicketNotch side="left" />
              <TicketNotch side="right" />
              <DashedDivider color={colors.border} width={cardW - 32} />
            </View>

            <ScrollView
              className="px-5"
              style={{ maxHeight: Dimensions.get("window").height * 0.55 }}
              showsVerticalScrollIndicator={false}
            >
              <Text className="mb-1 text-label text-ink">Payment Details</Text>
              <DetailRow label="Invoice Number" value={receipt.invoiceNumber} />
              <DetailRow label="Order Time" value={receipt.orderTime} />
              <DetailRow label="Payment Method" value={receipt.paymentMethod} />
              <DetailRow
                label="Payment Status"
                valueNode={
                  <View
                    className="rounded-pill px-3 py-1"
                    style={{ backgroundColor: colors.approve }}
                  >
                    <Text
                      className="text-caption font-semibold"
                      style={{ color: "#FFFFFF" }}
                    >
                      {receipt.paymentStatus}
                    </Text>
                  </View>
                }
              />
              <DetailRow label="Amount" value={amountLabel} />

              <View className="my-4">
                <DashedDivider color={colors.border} width={cardW - 40} />
              </View>

              <Text className="mb-1 text-label text-ink">Product Details</Text>
              <ProductRow label={productLabel} amount={amountLabel} />
              <ProductRow label="Total Amount" amount={amountLabel} />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Download PDF Receipt"
                onPress={() => void onDownload()}
                disabled={downloading}
                className="mb-2 mt-5 flex-row items-center justify-center gap-2 rounded-xl py-3.5 active:opacity-80"
                style={{
                  backgroundColor: colors.surfaceAlt,
                  opacity: downloading ? 0.6 : 1,
                }}
              >
                <AppIcon
                  name="download"
                  size={18}
                  color={colors.inkSoft}
                  strokeWidth={2}
                />
                <Text className="text-label text-ink-soft">
                  {downloading ? "Preparing PDF…" : "Download PDF Receipt"}
                </Text>
              </Pressable>
            </ScrollView>
          </View>

          <View style={{ marginTop: -1 }}>
            <ScallopedEdge width={cardW} fill={colors.surface} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
