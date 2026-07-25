/**
 * JS-only colour tokens for APIs that cannot take Uniwind classNames
 * (StatusBar, tabBarStyle, ActivityIndicator, Razorpay sheet, SVG charts).
 * UI styling lives in `src/global.css` + `className`.
 *
 * These MIRROR the CSS variables in global.css exactly. `tokens.parity.test.ts`
 * parses both files and fails if they ever drift.
 *
 * Brand direction: black/white primary with vibrant component accents.
 * No purple/violet. No gradients.
 */
export type ColorToken =
  | "primary" | "primarySoft" | "primaryText" | "onPrimary"
  | "accent" | "accentStrong" | "accentSoft" | "accentText" | "onAccent"
  | "paper" | "surface" | "surfaceAlt" | "border" | "borderStrong"
  | "ink" | "inkSoft" | "inkMuted" | "inkFaint" | "inverse"
  | "approve" | "approveBg" | "approveText" | "onApprove"
  | "deny" | "denyBg" | "denyText" | "onDeny"
  | "warn" | "warnBg" | "warnText" | "onWarn"
  | "info" | "infoSoft" | "infoText" | "onInfo"
  | "onboardBg" | "onboardInk" | "onboardInkMuted"
  | "onboardCta" | "onOnboardCta" | "onboardDot" | "onboardBorder";

export type ThemeColors = Record<ColorToken, string>;

export const lightColors: ThemeColors = {
  primary: "#111111",
  primarySoft: "#EBEBEB",
  primaryText: "#111111",
  onPrimary: "#FFFFFF",

  accent: "#00A89D",
  accentStrong: "#008F86",
  accentSoft: "#DFF7F5",
  accentText: "#007A73",
  onAccent: "#FFFFFF",

  paper: "#F2F2F2",
  surface: "#FFFFFF",
  surfaceAlt: "#EBEBEB",
  border: "#E0E0E0",
  borderStrong: "#8A8A8A",

  ink: "#0A0A0A",
  inkSoft: "#333333",
  inkMuted: "#6B6B6B",
  inkFaint: "#A3A3A3",
  inverse: "#FFFFFF",

  approve: "#0D9F6E",
  approveBg: "#D8F5EA",
  approveText: "#0A7A55",
  onApprove: "#FFFFFF",

  deny: "#E03E2F",
  denyBg: "#FDE8E6",
  denyText: "#B82E22",
  onDeny: "#FFFFFF",

  warn: "#F5A524",
  warnBg: "#FFF3DC",
  warnText: "#8A5A0A",
  onWarn: "#0A0A0A",

  info: "#1A8CFF",
  infoSoft: "#E5F2FF",
  infoText: "#0A6AD4",
  onInfo: "#FFFFFF",

  onboardBg: "#F2F2F2",
  onboardInk: "#0A0A0A",
  onboardInkMuted: "#6B6B6B",
  onboardCta: "#111111",
  onOnboardCta: "#FFFFFF",
  onboardDot: "#D4D4D4",
  onboardBorder: "#E0E0E0",
};

export const darkColors: ThemeColors = {
  primary: "#F5F5F5",
  primarySoft: "#2A2A2A",
  primaryText: "#F5F5F5",
  onPrimary: "#0A0A0A",

  accent: "#2DD4BF",
  accentStrong: "#2DD4BF",
  accentSoft: "#0F2F2C",
  accentText: "#5EEAD4",
  onAccent: "#0A0A0A",

  paper: "#0A0A0A",
  surface: "#171717",
  surfaceAlt: "#242424",
  border: "#2E2E2E",
  borderStrong: "#6B6B6B",

  ink: "#F5F5F5",
  inkSoft: "#D4D4D4",
  inkMuted: "#A3A3A3",
  inkFaint: "#737373",
  inverse: "#0A0A0A",

  approve: "#34D399",
  approveBg: "#0F2A1F",
  approveText: "#6EE7B7",
  onApprove: "#0A0A0A",

  deny: "#F87171",
  denyBg: "#3A1512",
  denyText: "#FCA5A5",
  onDeny: "#0A0A0A",

  warn: "#FBBF24",
  warnBg: "#2A2208",
  warnText: "#FCD34D",
  onWarn: "#0A0A0A",

  info: "#60A5FA",
  infoSoft: "#0F1F33",
  infoText: "#93C5FD",
  onInfo: "#0A0A0A",

  onboardBg: "#0A0A0A",
  onboardInk: "#F5F5F5",
  onboardInkMuted: "#A3A3A3",
  onboardCta: "#F5F5F5",
  onOnboardCta: "#0A0A0A",
  onboardDot: "#3D3D3D",
  onboardBorder: "#2E2E2E",
};

export function getColors(scheme: string | null | undefined): ThemeColors {
  return scheme === "dark" ? darkColors : lightColors;
}

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  "2xl": 48,
  "3xl": 64,
} as const;

export type SpacingStep = keyof typeof SPACING;

export const ELEVATION = {
  1: {
    shadowColor: "#000000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  2: {
    shadowColor: "#000000",
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;

export type AppRole = "resident" | "guard" | "admin";

export interface RoleAccent {
  accent: ColorToken;
  accentSoft: ColorToken;
  accentText: ColorToken;
  emphasis: ColorToken;
}

const SHARED_CTA = {
  accent: "primary",
  accentSoft: "primarySoft",
  accentText: "primaryText",
} as const;

export const ROLE_ACCENTS: Record<AppRole, RoleAccent> = {
  guard: { ...SHARED_CTA, emphasis: "warn" },
  admin: { ...SHARED_CTA, emphasis: "accent" },
  resident: { ...SHARED_CTA, emphasis: "approve" },
};

export function getRoleAccent(
  role: AppRole,
  scheme: string | null | undefined,
): Record<keyof RoleAccent, string> {
  const palette = getColors(scheme);
  const tokens = ROLE_ACCENTS[role];
  return {
    accent: palette[tokens.accent],
    accentSoft: palette[tokens.accentSoft],
    accentText: palette[tokens.accentText],
    emphasis: palette[tokens.emphasis],
  };
}

const CHART_MID = {
  light: ["#7FD4CD", "#3DB8AD"],
  dark: ["#0F4A45", "#5EEAD4"],
} as const;

export function getChartScale(scheme: string | null | undefined): string[] {
  const c = getColors(scheme);
  const isDark = scheme === "dark";
  const [lo, hi] = isDark ? CHART_MID.dark : CHART_MID.light;
  return isDark
    ? [c.surfaceAlt, c.infoSoft, lo, c.info, hi]
    : [c.surfaceAlt, c.infoSoft, lo, hi, c.infoText];
}

/** @deprecated prefer useThemeColors() so dark mode is respected. */
export const color = lightColors;
