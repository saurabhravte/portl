import { BrandMark } from "@/components/BrandMark";
import { AppIcon, Avatar, Button, Screen } from "@/components/ui";
import type { AppIconName } from "@/components/ui";
import { useOnboardingStore } from "@/lib/onboarding";
import { useThemeColors } from "@/theme/useThemeColors";
import { Image } from "expo-image";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  Text,
  View,
  ViewToken,
} from "react-native";

const { width } = Dimensions.get("window");
const gateHero = require("../../../assets/images/onboarding-gate.png");

type Slide = {
  key: "welcome" | "benefit" | "notify";
  eyebrow: string;
  title: React.ReactNode;
  body: string;
};

// Three screens: (1) welcome + intro, (2) the core benefit with an
// illustration, (3) the notifications ask + the prominent Get Started button.
const SLIDES: Slide[] = [
  {
    key: "welcome",
    eyebrow: "WELCOME",
    title: (
      <Text className="text-display text-ink">
        Welcome to <Text className="text-primary">Portl</Text>
      </Text>
    ),
    body: "Your society's gate, visitors, notices and payments — all in one calm, simple place.",
  },
  {
    key: "benefit",
    eyebrow: "WHY PORTL",
    title: <Text className="text-display text-ink">Approve visitors in one tap</Text>,
    body: "When a guard logs someone at the gate, you get an instant request. Approve or deny without getting up.",
  },
  {
    key: "notify",
    eyebrow: "ONE LAST THING",
    title: <Text className="text-display text-ink">Stay in the loop</Text>,
    body: "Turn on notifications so you never miss a visitor at the gate, a delivery, or a community alert.",
  },
];

/* ── Per-slide illustrations (vector/icon based, no extra assets) ─────── */

function WelcomeVisual() {
  return (
    <View className="overflow-hidden rounded-xl border border-border bg-surface">
      <Image
        source={gateHero}
        style={{ width: "100%", height: 240 }}
        contentFit="cover"
        accessibilityLabel="A Portl-managed community entrance"
      />
    </View>
  );
}

function ApprovalPill({
  label,
  icon,
  tone,
  colors,
}: {
  label: string;
  icon: AppIconName;
  tone: "approve" | "deny";
  colors: ReturnType<typeof useThemeColors>;
}) {
  const bg = tone === "approve" ? "bg-approve-bg" : "bg-deny-bg";
  const fg = tone === "approve" ? "text-approve" : "text-deny";
  const iconColor = tone === "approve" ? colors.approve : colors.deny;
  return (
    <View className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-pill px-3 py-2 ${bg}`}>
      <AppIcon name={icon} size={16} color={iconColor} />
      <Text className={`text-caption font-semibold ${fg}`}>{label}</Text>
    </View>
  );
}

function BenefitVisual({ colors }: { colors: ReturnType<typeof useThemeColors> }) {
  return (
    <View className="h-60 justify-center rounded-xl bg-primary-soft border border-border p-5">
      {/* A mock "visitor at the gate" approval request card. */}
      <View className="gap-3 rounded-lg border border-border bg-surface p-4">
        <View className="flex-row items-center gap-3">
          <Avatar name="Guest Visitor" size={40} />
          <View className="flex-1">
            <Text className="text-label text-ink">Delivery — Guest</Text>
            <Text className="text-caption text-ink-soft">At Gate 1 · for Flat A-101</Text>
          </View>
          <View className="h-8 w-8 items-center justify-center rounded-full bg-accent-soft">
            <AppIcon name="shield" size={16} color={colors.accent} />
          </View>
        </View>
        <View className="flex-row gap-2">
          <ApprovalPill label="Deny" icon="close" tone="deny" colors={colors} />
          <ApprovalPill label="Approve" icon="check" tone="approve" colors={colors} />
        </View>
      </View>
    </View>
  );
}

function NotifyVisual({ colors }: { colors: ReturnType<typeof useThemeColors> }) {
  return (
    <View className="h-60 items-center justify-center rounded-xl bg-primary-soft border border-border">
      <View className="h-32 w-32 items-center justify-center rounded-full bg-surface border border-border">
        <AppIcon name="bell-active" size={64} color={colors.primary} />
      </View>
      {/* status dots — reinforce "alerts" without relying on color alone */}
      <View className="mt-4 flex-row items-center gap-2">
        <View className="flex-row items-center gap-1 rounded-pill bg-approve-bg px-2.5 py-1">
          <AppIcon name="check-circle" size={12} color={colors.approve} />
          <Text className="text-caption text-approve">Visitor approved</Text>
        </View>
        <View className="flex-row items-center gap-1 rounded-pill bg-warn-bg px-2.5 py-1">
          <AppIcon name="delivery" size={12} color={colors.warn} />
          <Text className="text-caption text-warn">Parcel at gate</Text>
        </View>
      </View>
    </View>
  );
}

function SlideVisual({
  slideKey,
  colors,
}: {
  slideKey: Slide["key"];
  colors: ReturnType<typeof useThemeColors>;
}) {
  if (slideKey === "welcome") return <WelcomeVisual />;
  if (slideKey === "benefit") return <BenefitVisual colors={colors} />;
  return <NotifyVisual colors={colors} />;
}

export default function Onboarding() {
  const router = useRouter();
  const colors = useThemeColors();
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const completeOnboarding = useOnboardingStore((s) => s.complete);

  // `askPermission` is only true when the user taps Get Started on the final
  // screen; skipping never triggers the OS prompt.
  const finish = async (askPermission: boolean) => {
    setBusy(true);
    try {
      if (askPermission) {
        try {
          await Notifications.requestPermissionsAsync();
        } catch {
          // Permission is optional — never block onboarding on it.
        }
      }
      await completeOnboarding();
      router.replace("/(auth)/sign-in" as any);
    } finally {
      setBusy(false);
    }
  };

  const goNext = () => {
    if (index < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    }
  };

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0];
      if (typeof first?.index === "number") setIndex(first.index);
    },
  ).current;

  const viewConfig = useMemo(
    () => ({ viewAreaCoveragePercentThreshold: 60 }),
    [],
  );

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  const isLast = index === SLIDES.length - 1;

  return (
    <Screen className="justify-between pb-6">
      <View className="flex-row items-center justify-between px-6 pt-4">
        <View className="flex-row items-center gap-2">
          <BrandMark size="sm" />
          <Text className="text-title text-ink">Portl</Text>
        </View>
        {!isLast ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
            onPress={() => void finish(false)}
            disabled={busy}
            hitSlop={8}
          >
            <Text className="text-label text-ink-muted">Skip</Text>
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewConfig}
        renderItem={({ item }) => (
          <View style={{ width }} className="justify-center gap-5 px-8">
            <SlideVisual slideKey={item.key} colors={colors} />
            <View className="gap-2">
              <Text className="text-caption uppercase tracking-widest text-primary">
                {item.eyebrow}
              </Text>
              {item.title}
              <Text className="text-body text-ink-soft">{item.body}</Text>
            </View>
          </View>
        )}
      />

      <View className="gap-4 px-6">
        <View className="flex-row items-center justify-center gap-2">
          {SLIDES.map((s, i) => (
            <View
              key={s.key}
              accessibilityLabel={`Step ${i + 1} of ${SLIDES.length}`}
              style={{
                width: i === index ? 20 : 8,
                height: 8,
                borderRadius: 999,
                backgroundColor: i === index ? colors.primary : colors.border,
              }}
            />
          ))}
        </View>

        {isLast ? (
          <View className="gap-2">
            <Button
              title="Get Started"
              onPress={() => void finish(true)}
              loading={busy}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => void finish(false)}
              disabled={busy}
              className="items-center py-2"
            >
              <Text className="text-label text-ink-muted">Maybe later</Text>
            </Pressable>
          </View>
        ) : (
          <View className="flex-row items-center justify-between">
            <Pressable
              accessibilityRole="button"
              onPress={() => void finish(false)}
              disabled={busy}
              className="min-h-11 justify-center px-2"
            >
              <Text className="text-label text-ink-muted">Skip</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next"
              onPress={goNext}
              disabled={busy}
              className="h-14 w-14 items-center justify-center rounded-full bg-primary active:opacity-80"
            >
              <AppIcon name="next" size={24} color={colors.onPrimary} />
            </Pressable>
          </View>
        )}
      </View>
    </Screen>
  );
}
