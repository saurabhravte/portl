import { ONBOARDING_ART } from "@/features/auth/OnboardingArt";
import { ONBOARDING } from "@/lib/copy";
import { useOnboardingStore } from "@/lib/onboarding";
import { useResponsive } from "@/theme/useResponsive";
import { useThemeColors } from "@/theme/useThemeColors";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ListRenderItemInfo,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Slide = (typeof ONBOARDING.slides)[number];

export default function Onboarding() {
  const router = useRouter();
  const colors = useThemeColors();
  const { width, height } = useWindowDimensions();
  const { scale } = useResponsive();
  const complete = useOnboardingStore((s) => s.complete);

  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);
  const [busy, setBusy] = useState(false);

  const slides = ONBOARDING.slides;
  const isLast = index === slides.length - 1;
  const artSize = scale(200, 148, 260);
  /** Reserved art box — fixed height so SVG never collapses onto title text. */
  const artBox = artSize + 48;
  /** Page height: remaining space under skip row and above CTA/dots. */
  const pageHeight = Math.max(height * 0.55, artBox + 160);

  const finish = useCallback(async () => {
    setBusy(true);
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status === "undetermined") {
        await Notifications.requestPermissionsAsync();
      }
    } catch {
      // Permission prompts can fail on emulators without Play Services.
    } finally {
      await complete();
      setBusy(false);
      router.replace("/(auth)/sign-in");
    }
  }, [complete, router]);

  const onCta = () => {
    if (isLast) {
      void finish();
      return;
    }
    const next = index + 1;
    listRef.current?.scrollToOffset({ offset: next * width, animated: true });
    setIndex(next);
  };

  const onSkip = () => void finish();

  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(event.nativeEvent.contentOffset.x / width);
    if (page !== index && page >= 0 && page < slides.length) setIndex(page);
  };

  const renderItem = ({ item }: ListRenderItemInfo<Slide>) => {
    const Art = ONBOARDING_ART[item.key];
    return (
      <View style={{ width, height: pageHeight }} className="items-center px-8">
        <View
          style={{ height: artBox, width: "100%" }}
          className="items-center justify-center"
        >
          <Art
            size={artSize}
            ink={colors.ink}
            muted={colors.inkMuted}
            background={colors.surface}
          />
        </View>
        <View className="w-full gap-3 pb-4">
          <Text className="text-center text-display text-ink">{item.title}</Text>
          <Text className="text-center text-body text-ink-muted">{item.body}</Text>
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-paper">
      <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
        <View className="h-11 flex-row items-center justify-end px-6">
          {!isLast ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={ONBOARDING.skip}
              onPress={onSkip}
              hitSlop={12}
              className="min-h-11 justify-center px-2 active:opacity-60"
            >
              <Text className="text-label text-ink-muted">{ONBOARDING.skip}</Text>
            </Pressable>
          ) : null}
        </View>

        <FlatList
          ref={listRef}
          style={{ flexGrow: 0 }}
          data={slides}
          keyExtractor={(slide) => slide.key}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
          getItemLayout={(_, i) => ({
            length: width,
            offset: width * i,
            index: i,
          })}
          renderItem={renderItem}
        />

        <View className="mt-auto gap-6 px-8 pb-4 pt-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={slides[index].cta}
            accessibilityState={{ disabled: busy, busy }}
            onPress={onCta}
            disabled={busy}
            className={`min-h-14 items-center justify-center rounded-xl bg-primary px-4 ${
              busy ? "opacity-50" : "active:opacity-80"
            }`}
          >
            <Text className="text-label text-on-primary">{slides[index].cta}</Text>
          </Pressable>

          <View
            className="flex-row items-center justify-center gap-2"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {slides.map((slide, i) => (
              <View
                key={slide.key}
                className={`h-2 rounded-pill ${
                  i === index ? "w-6 bg-primary" : "w-2 bg-border-strong"
                }`}
              />
            ))}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
