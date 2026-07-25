import { ONBOARDING_ART, type OnboardingArtKey } from "@/features/auth/OnboardingArt";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Onboarding — Phases 4.1 to 4.4.
 *
 * Rebuilt from scratch against the supplied reference. The previous version
 * was a 367-line screen with per-slide bespoke components, an 842 KB raster
 * hero and a floating brand lockup pinned over it; all of that is gone.
 *
 * Structure, matching the reference exactly:
 *   art (upper half) -> title -> body -> full-width CTA -> page dots
 *
 * PALETTE (4.4): monochrome, via the onboard-* tokens only. This screen
 * deliberately does NOT use the claret CTA. It runs before sign-in, before
 * the user has any idea what Portl is, and a black button reads as "continue"
 * rather than as a brand statement. Colour starts at the login screen.
 *
 * The dark-mode counterpart inverts to white-on-black rather than switching
 * to the warm surfaces, so onboarding stays monochrome in both schemes.
 */

interface Slide {
  key: OnboardingArtKey;
  title: string;
  body: string;
  cta: string;
}

const SLIDES: Slide[] = [
  {
    key: "welcome",
    title: "Welcome to Portl",
    body: "Your society's gate, visitors, notices and payments — all in one calm, simple place.",
    cta: "Next",
  },
  {
    key: "approve",
    title: "Approve visitors in one tap",
    body: "When a guard logs someone at the gate, the request reaches you instantly. Approve or deny without getting up.",
    cta: "Next",
  },
  {
    key: "notify",
    title: "Stay in the loop",
    body: "Turn on notifications so you never miss a visitor, a delivery, or a community alert.",
    cta: "Get Started",
  },
];

export default function Onboarding() {
  const router = useRouter();
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const { scale } = useResponsive();
  const complete = useOnboardingStore((s) => s.complete);

  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);
  const [busy, setBusy] = useState(false);

  const isLast = index === SLIDES.length - 1;
  const artSize = scale(200, 148, 260);

  /**
   * Only the final slide asks for notifications, and only on the way out.
   * Asking on mount trains people to deny before they know what the app
   * does. A refusal is not an error here — it must never block entry.
   */
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

  // Derive the page from the scroll offset rather than onViewableItemsChanged:
  // the viewability callback fires mid-swipe and made the dots flicker.
  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(event.nativeEvent.contentOffset.x / width);
    if (page !== index) setIndex(page);
  };

  return (
    <View className="flex-1 bg-onboard-bg">
      <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
        {/* Skip stays available on every slide — onboarding is never a gate. */}
        <View className="h-11 flex-row items-center justify-end px-6">
          {!isLast ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Skip onboarding"
              onPress={onSkip}
              hitSlop={12}
              className="min-h-11 justify-center px-2 active:opacity-60"
            >
              <Text className="text-label text-onboard-ink-muted">Skip</Text>
            </Pressable>
          ) : null}
        </View>

        <FlatList
          ref={listRef}
          data={SLIDES}
          keyExtractor={(slide) => slide.key}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
          renderItem={({ item }) => {
            const Art = ONBOARDING_ART[item.key];
            return (
              <View style={{ width }} className="flex-1 items-center px-8">
                <View className="flex-1 items-center justify-center">
                  <Art
                    size={artSize}
                    ink={colors.onboardInk}
                    muted={colors.onboardInkMuted}
                    background={colors.onboardBg}
                  />
                </View>
                <View className="gap-3 pb-6">
                  <Text className="text-center text-display text-onboard-ink">
                    {item.title}
                  </Text>
                  <Text className="text-center text-body text-onboard-ink-muted">
                    {item.body}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        <View className="gap-6 px-8 pb-4 pt-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={SLIDES[index].cta}
            accessibilityState={{ disabled: busy, busy }}
            onPress={onCta}
            disabled={busy}
            className={`min-h-14 items-center justify-center rounded-md bg-onboard-cta px-4 ${
              busy ? "opacity-50" : "active:opacity-80"
            }`}
          >
            <Text className="text-label text-on-onboard-cta">
              {SLIDES[index].cta}
            </Text>
          </Pressable>

          {/* Dots are decoration, not a control — the list is the control. */}
          <View
            className="flex-row items-center justify-center gap-2"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {SLIDES.map((slide, i) => (
              <View
                key={slide.key}
                className={`h-2 rounded-pill ${
                  i === index ? "w-6 bg-onboard-cta" : "w-2 bg-onboard-dot"
                }`}
              />
            ))}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
