import { AppIcon } from "@/components/ui";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { useThemeColors } from "@/theme/useThemeColors";
import React from "react";
import { Text, View } from "react-native";

/**
 * App-wide connectivity strip shown on every screen (resident / guard /
 * admin). The guard gate screens additionally show a richer queue banner
 * (`OfflineBanner`) with pending-action counts; this is the lightweight,
 * global "No Internet" / "Slow Network" signal.
 */
export function ConnectionBanner() {
  const { isOffline, isSlow } = useOnlineStatus();
  const colors = useThemeColors();
  if (!isOffline && !isSlow) return null;

  return (
    <View
      accessibilityRole="alert"
      className={`w-full flex-row items-center justify-center gap-2 px-4 py-1.5 ${
        isOffline ? "bg-deny" : "bg-warn"
      }`}
    >
      <AppIcon
        name={isOffline ? "offline" : "slow"}
        size={14}
        color={colors.onPrimary}
      />
      <Text className="text-caption font-semibold text-on-primary">
        {isOffline
          ? "No internet connection"
          : "Slow connection — this may take a moment"}
      </Text>
    </View>
  );
}
