/**
 * JS-only color tokens for APIs that cannot take Uniwind classNames
 * (StatusBar, tabBarStyle, ActivityIndicator, Razorpay sheet, etc.).
 * UI styling lives in `src/global.css` + `className`.
 *
 * These mirror the CSS variables in global.css exactly. Use the
 * `useThemeColors()` hook to get the palette for the active scheme;
 * the legacy `color` export stays as the light palette for old code.
 *
 * Brand direction: Portl blue (sky / gate imagery). No purple or violet.
 */
export type ColorToken =
  | "primary" | "primarySoft" | "onPrimary"
  | "accent" | "accentSoft" | "onAccent"
  | "paper" | "surface" | "surfaceAlt" | "border"
  | "ink" | "inkSoft" | "inkMuted" | "inkFaint" | "inverse"
  | "approve" | "approveBg" | "deny" | "denyBg" | "warn" | "warnBg";

export type ThemeColors = Record<ColorToken, string>;

export const lightColors: Record<ColorToken, string> = {
  primary: "#2563EB",
  primarySoft: "#EFF6FF",
  onPrimary: "#FFFFFF",
  // Vibrant 10% accent (indigo-violet) — matches the Portl mockups' shield /
  // CTA / notification accents. Used only on small, high-signal components.
  accent: "#5B5BF0",
  accentSoft: "#ECECFE",
  onAccent: "#FFFFFF",
  paper: "#F5F8FC",
  surface: "#FFFFFF",
  surfaceAlt: "#EEF3F9",
  border: "#D9E2EC",
  ink: "#0F172A",
  inkSoft: "#334155",
  inkMuted: "#64748B",
  inkFaint: "#94A3B8",
  inverse: "#FFFFFF",
  approve: "#16A34A",
  approveBg: "#E8F7EE",
  deny: "#DC2626",
  denyBg: "#FDECEC",
  warn: "#D97706",
  warnBg: "#FDF3E3",
};

export const darkColors: Record<ColorToken, string> = {
  primary: "#3B82F6",
  primarySoft: "#152238",
  onPrimary: "#FFFFFF",
  // Accent glows a touch brighter on the deep-navy dark surfaces.
  accent: "#7C7CFF",
  accentSoft: "#1E2044",
  onAccent: "#FFFFFF",
  paper: "#0A1018",
  surface: "#121A24",
  surfaceAlt: "#1A2433",
  border: "#273244",
  ink: "#F1F5F9",
  inkSoft: "#CBD5E1",
  inkMuted: "#94A3B8",
  inkFaint: "#64748B",
  inverse: "#0A1018",
  approve: "#34D399",
  approveBg: "#0C2A1E",
  deny: "#F87171",
  denyBg: "#331416",
  warn: "#FBBF24",
  warnBg: "#2E2410",
};

export function getColors(scheme: string | null | undefined): ThemeColors {
  return scheme === "dark" ? darkColors : lightColors;
}

/** @deprecated prefer useThemeColors() so dark mode is respected. */
export const color = lightColors;
