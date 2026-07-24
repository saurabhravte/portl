import { useColorScheme } from "react-native";
import { getColors, type ThemeColors } from "./tokens";

/**
 * Palette for the active color scheme. Reacts to both the OS setting and
 * the in-app switch (which calls Appearance.setColorScheme).
 */
export function useThemeColors(): ThemeColors {
  const scheme = useColorScheme();
  return getColors(scheme);
}
