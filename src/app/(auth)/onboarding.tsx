import { BrandMark } from "@/components/BrandMark";
import { AppIcon, Button, Screen } from "@/components/ui";
import { useOnboardingStore } from "@/lib/onboarding";
import { useThemeColors } from "@/theme/useThemeColors";
import { Image } from "expo-image";
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
import type { AppIconName } from "@/components/ui";

const { width } = Dimensions.get("window");
const gateHero = require("../../../assets/images/onboarding-gate.png");

type SlideVisual =
  | { kind: "hero" }
  | { kind: "icon"; icon: AppIconName; tint?: string }
  | {
      kind: "grid";
      items: { icon: AppIconName; label: string; tint: string }[];
    }
  | {
      kind: "features";
      icon: AppIconName;
      items: { icon: AppIconName; label: string }[];
    };

type Slide = {
  key: string;
  title: React.ReactNode;
  body: string;
  visual: SlideVisual;
  cta?: string;
};

const FEATURE_TINTs = {
  complaints: "#FEE2E2",
  amenities: "#CFFAFE",
  visitors: "#DCFCE7",
  payments: "#DBEAFE",
} as const;

const SLIDES: Slide[] = [
  {
    key: "welcome",
    title: (
      <Text className="text-display text-ink">
        Welcome to <Text className="text-primary">Portl</Text>
      </Text>
    ),
    body: "Everything your community needs, now in one place.",
    visual: { kind: "hero" },
    cta: "Get Started",
  },
  {
    key: "updates",
    title: <Text className="text-display text-ink">Stay Updated Instantly</Text>,
    body: "Get real-time updates and important notices.",
    visual: { kind: "icon", icon: "bell-active" },
  },
  {
    key: "services",
    title: (
      <Text className="text-display text-ink">Manage Services Effortlessly</Text>
    ),
    body: "Raise complaints, book amenities and track requests.",
    visual: {
      kind: "grid",
      items: [
        { icon: "complaints", label: "Complaints", tint: FEATURE_TINTs.complaints },
        { icon: "amenities", label: "Amenities", tint: FEATURE_TINTs.amenities },
        { icon: "visitors", label: "Visitors", tint: FEATURE_TINTs.visitors },
        { icon: "payments", label: "Payments", tint: FEATURE_TINTs.payments },
      ],
    },
  },
  {
    key: "secure",
    title: (
      <Text className="text-display text-ink">Secure. Simple. Community First.</Text>
    ),
    body: "Your security and convenience are our top priority.",
    visual: {
      kind: "features",
      icon: "shield",
      items: [
        { icon: "shield", label: "Secure & Verified Access" },
        { icon: "communityPeople", label: "Trusted Community" },
        { icon: "check-circle", label: "Privacy First" },
      ],
    },
    cta: "Let's Go!",
  },
];

function SlideVisualBlock({
  visual,
  primary,
}: {
  visual: SlideVisual;
  primary: string;
}) {
  if (visual.kind === "hero") {
    return (
      <View className="overflow-hidden rounded-xl border border-border bg-surface">
        <Image
          source={gateHero}
          style={{ width: "100%", height: 220 }}
          contentFit="cover"
          accessibilityLabel="Portl gated community entrance"
        />
      </View>
    );
  }

  if (visual.kind === "icon") {
    return (
      <View className="h-56 items-center justify-center rounded-xl bg-primary-soft border border-border">
        <View className="h-28 w-28 items-center justify-center rounded-full bg-surface border border-border">
          <AppIcon name={visual.icon} size={64} color={primary} />
        </View>
      </View>
    );
  }

  if (visual.kind === "grid") {
    return (
      <View className="gap-3">
        <View className="flex-row flex-wrap justify-between gap-y-3">
          {visual.items.map((item) => (
            <View
              key={item.label}
              className="w-[48%] items-center gap-2 rounded-xl border border-border p-4"
              style={{ backgroundColor: item.tint }}
            >
              <AppIcon name={item.icon} size={28} color="#0F172A" />
              <Text className="text-label text-ink">{item.label}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View className="gap-4">
      <View className="h-40 items-center justify-center rounded-xl bg-primary-soft border border-border">
        <AppIcon name={visual.icon} size={72} color={primary} />
      </View>
      <View className="gap-2">
        {visual.items.map((item) => (
          <View
            key={item.label}
            className="flex-row items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5"
          >
            <AppIcon name={item.icon} size={20} color={primary} />
            <Text className="text-label text-ink">{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function Onboarding() {
  const router = useRouter();
  const colors = useThemeColors();
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const completeOnboarding = useOnboardingStore((s) => s.complete);

  const finish = async () => {
    setBusy(true);
    try {
      await completeOnboarding();
      router.replace("/(auth)/sign-in" as any);
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    if (index >= SLIDES.length - 1) {
      void finish();
      return;
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
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
    const nextIndex = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(nextIndex);
  };

  const isLast = index === SLIDES.length - 1;
  const isFirst = index === 0;
  const slide = SLIDES[index];

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
            onPress={() => void finish()}
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
            <SlideVisualBlock visual={item.visual} primary={colors.primary} />
            {item.title}
            <Text className="text-body text-ink-soft">{item.body}</Text>
          </View>
        )}
      />

      <View className="gap-4 px-6">
        <View className="flex-row items-center justify-center gap-2">
          {SLIDES.map((s, i) => (
            <View
              key={s.key}
              accessibilityLabel={`Slide ${i + 1} of ${SLIDES.length}`}
              style={{
                width: i === index ? 18 : 8,
                height: 8,
                borderRadius: 999,
                backgroundColor: i === index ? colors.primary : colors.border,
              }}
            />
          ))}
        </View>

        {isFirst || isLast ? (
          <>
            <Button
              title={slide.cta ?? (isLast ? "Let's Go!" : "Get Started")}
              onPress={next}
              loading={busy}
            />
            {isFirst ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void finish()}
                disabled={busy}
                className="items-center py-1"
              >
                <Text className="text-label text-ink-soft">
                  Already have an account?{" "}
                  <Text className="text-primary">Login</Text>
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <View className="flex-row items-center justify-between">
            <Pressable
              accessibilityRole="button"
              onPress={() => void finish()}
              disabled={busy}
              className="min-h-11 justify-center px-2"
            >
              <Text className="text-label text-ink-muted">Skip</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next"
              onPress={next}
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
