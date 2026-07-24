/**
 * Lightweight RN chart primitives inspired by EvilCharts
 * (https://evilcharts.com/docs) — design-first bars/heatmaps.
 * EvilCharts itself is Recharts + shadcn (web); Portl uses Expo RN + SVG.
 */
import { useThemeColors } from "@/theme/useThemeColors";
import React, { useMemo } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Rect } from "react-native-svg";

export function MetricStrip({
  items,
}: {
  items: { label: string; value: string | number }[];
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {items.map((item) => (
        <View
          key={item.label}
          className="min-w-[28%] grow rounded-lg bg-surface-alt px-3 py-2"
        >
          <Text className="text-title text-ink">{item.value}</Text>
          <Text className="text-caption text-ink-muted">{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function HorizontalBars({
  data,
  maxBars = 8,
}: {
  data: { label: string; value: number }[];
  maxBars?: number;
}) {
  const colors = useThemeColors();
  const rows = data.slice(0, maxBars);
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <View className="gap-2">
      {rows.map((row) => {
        const pct = Math.max(4, Math.round((row.value / max) * 100));
        return (
          <View key={row.label} className="gap-1">
            <View className="flex-row items-center justify-between">
              <Text className="flex-1 pr-2 text-caption text-ink" numberOfLines={1}>
                {row.label}
              </Text>
              <Text className="text-caption text-ink-muted">{row.value}</Text>
            </View>
            <View className="h-2 overflow-hidden rounded-full bg-surface-alt">
              <View
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  borderRadius: 999,
                  backgroundColor: colors.primary,
                }}
              />
            </View>
          </View>
        );
      })}
      {!rows.length ? (
        <Text className="text-caption text-ink-muted">No data in this window.</Text>
      ) : null}
    </View>
  );
}

/** 24h × 7d visitor heatmap (EvilCharts-style density grid). */
export function TrafficHeatmap({
  cells,
}: {
  cells: { dow: number; hour: number; count: number }[];
}) {
  const colors = useThemeColors();
  const max = Math.max(1, ...cells.map((c) => c.count), 1);
  const map = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cells) m.set(`${c.dow}:${c.hour}`, c.count);
    return m;
  }, [cells]);

  const cellW = 10;
  const cellH = 14;
  const gap = 2;
  const labelW = 18;
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const dows = [1, 2, 3, 4, 5, 6, 0]; // Mon→Sun
  const dowLabel = ["S", "M", "T", "W", "T", "F", "S"];
  const width = labelW + hours.length * (cellW + gap);
  const height = dows.length * (cellH + gap);

  const fillFor = (count: number) => {
    if (count <= 0) return colors.surfaceAlt;
    const t = count / max;
    if (t < 0.25) return "#BFDBFE";
    if (t < 0.5) return "#60A5FA";
    if (t < 0.75) return "#2563EB";
    return "#1E3A8A";
  };

  return (
    <View className="gap-2">
      <View className="flex-row">
        <View style={{ width: labelW, justifyContent: "space-around" }}>
          {dows.map((dow) => (
            <Text key={dow} className="text-caption text-ink-muted" style={{ height: cellH + gap }}>
              {dowLabel[dow]}
            </Text>
          ))}
        </View>
        <Svg width={width - labelW} height={height}>
          {dows.map((dow, row) =>
            hours.map((hour) => {
              const count = map.get(`${dow}:${hour}`) ?? 0;
              return (
                <Rect
                  key={`${dow}-${hour}`}
                  x={hour * (cellW + gap)}
                  y={row * (cellH + gap)}
                  width={cellW}
                  height={cellH}
                  rx={2}
                  fill={fillFor(count)}
                />
              );
            }),
          )}
        </Svg>
      </View>
      <Text className="text-caption text-ink-muted">
        Hours 0–23 (IST) · denser blue = more entries
      </Text>
    </View>
  );
}

export function ProgressRing({
  percent,
  label,
}: {
  percent: number | null | undefined;
  label: string;
}) {
  const colors = useThemeColors();
  const p = Number.isFinite(Number(percent))
    ? Math.max(0, Math.min(100, Number(percent)))
    : null;
  const size = 96;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = p == null ? c : c - (p / 100) * c;

  return (
    <View className="items-center gap-1">
      <View className="items-center justify-center" style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={colors.surfaceAlt}
            strokeWidth={stroke}
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={colors.primary}
            strokeWidth={stroke}
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <Text className="absolute text-title text-ink">
          {p == null ? "—" : `${Math.round(p)}%`}
        </Text>
      </View>
      <Text className="text-caption text-ink-muted">{label}</Text>
    </View>
  );
}
