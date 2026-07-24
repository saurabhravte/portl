import {
  Manrope_200ExtraLight,
  Manrope_300Light,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";
import type { TextStyle } from "react-native";

/**
 * Font assets passed to `useFonts`. The keys are the family names referenced
 * via the `fontFamily` style prop across the app.
 */
export const manropeFontMap = {
  Manrope_200ExtraLight,
  Manrope_300Light,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} as const;

/**
 * Maps a numeric font weight to the matching Manrope family name. Custom fonts
 * on native platforms do not synthesize weights from `fontWeight` alone, so we
 * resolve the correct file per weight instead.
 */
const WEIGHT_TO_FAMILY: Record<number, keyof typeof manropeFontMap> = {
  100: "Manrope_200ExtraLight",
  200: "Manrope_200ExtraLight",
  300: "Manrope_300Light",
  400: "Manrope_400Regular",
  500: "Manrope_500Medium",
  600: "Manrope_600SemiBold",
  700: "Manrope_700Bold",
  800: "Manrope_800ExtraBold",
  900: "Manrope_800ExtraBold",
};

export const DEFAULT_FONT_FAMILY = WEIGHT_TO_FAMILY[400];

/**
 * Resolves the Manrope family name for a given `fontWeight` value, defaulting to
 * regular. Accepts the values React Native allows for `TextStyle["fontWeight"]`.
 */
export function getManropeFamily(
  fontWeight?: TextStyle["fontWeight"],
): keyof typeof manropeFontMap {
  if (fontWeight == null) return DEFAULT_FONT_FAMILY;

  if (fontWeight === "normal") return WEIGHT_TO_FAMILY[400];
  if (fontWeight === "bold") return WEIGHT_TO_FAMILY[700];

  const numeric =
    typeof fontWeight === "number" ? fontWeight : parseInt(fontWeight, 10);

  if (Number.isNaN(numeric)) return DEFAULT_FONT_FAMILY;

  const rounded = (Math.round(numeric / 100) * 100) as number;
  return WEIGHT_TO_FAMILY[rounded] ?? DEFAULT_FONT_FAMILY;
}
