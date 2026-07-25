/**
 * JS-only color tokens for APIs that cannot take Uniwind classNames
 * (StatusBar, tabBarStyle, ActivityIndicator, Razorpay sheet, SVG charts).
 * UI styling lives in `src/global.css` + `className`.
 *
 * These mirror the CSS variables in global.css exactly. Use `useThemeColors()`
 * for the active scheme; the legacy `color` export stays as the light palette.
 *
 * Brand direction: Portl orange (Primary/CTA) with sky as the secondary accent.
 *
 * Three families, do not mix them up:
 *   <role>      — FILL. Backgrounds, borders, icons, chart series.
 *   <role>Text  — the same role used AS TEXT on paper/surface. Required in
 *                 light mode, where the raw fills fail AA (orange 2.69:1).
 *   on<Role>    — label drawn on top of the fill. Always dark ink; white on
 *                 orange is 2.80:1 and fails.
 */
export type ColorToken =
  | "primary" | "primarySoft" | "primaryText" | "onPrimary"
  | "accent" | "accentSoft" | "accentText" | "onAccent"
  | "paper" | "surface" | "surfaceAlt" | "border"
  | "ink" | "inkSoft" | "inkMuted" | "inkFaint" | "inverse"
  | "approve" | "approveBg" | "approveText" | "onApprove"
  | "deny" | "denyBg" | "denyText" | "onDeny"
  | "warn" | "warnBg" | "warnText" | "onWarn"
  | "info" | "infoSoft" | "infoText" | "onInfo";

export type ThemeColors = Record<ColorToken, string>;

export const lightColors: ThemeColors = {
  primary: "#F97316",
  primarySoft: "#FFF1E6",
  primaryText: "#C2410C",
  onPrimary: "#18181B",

  accent: "#0EA5E9",
  accentSoft: "#E0F2FE",
  accentText: "#0369A1",
  onAccent: "#18181B",

  paper: "#FAFAFA",
  surface: "#FFFFFF",
  surfaceAlt: "#F8F8F9",
  border: "#E4E4E7",

  ink: "#18181B",
  inkSoft: "#3F3F46",
  inkMuted: "#71717A",
  inkFaint: "#A1A1AA",
  inverse: "#FFFFFF",

  approve: "#16A34A",
  approveBg: "#DCFCE7",
  approveText: "#15803D",
  onApprove: "#18181B",

  deny: "#EF4444",
  denyBg: "#FEE2E2",
  denyText: "#B91C1C",
  onDeny: "#18181B",

  warn: "#FACC15",
  warnBg: "#FEF9C3",
  warnText: "#854D0E",
  onWarn: "#18181B",

  info: "#3B82F6",
  infoSoft: "#DBEAFE",
  infoText: "#1D4ED8",
  onInfo: "#18181B",
};

export const darkColors: ThemeColors = {
  primary: "#FB923C",
  primarySoft: "#2A1B10",
  primaryText: "#FB923C",
  onPrimary: "#121212",

  accent: "#38BDF8",
  accentSoft: "#0C2A3A",
  accentText: "#38BDF8",
  onAccent: "#121212",

  paper: "#121212",
  surface: "#1E1E1F",
  surfaceAlt: "#26262A",
  border: "#2E2E32",

  ink: "#EDEDED",
  inkSoft: "#D4D4D8",
  inkMuted: "#A1A1AA",
  inkFaint: "#71717A",
  inverse: "#121212",

  approve: "#4ADE80",
  approveBg: "#0F2A1A",
  approveText: "#4ADE80",
  onApprove: "#121212",

  deny: "#F87171",
  denyBg: "#2E1516",
  denyText: "#F87171",
  onDeny: "#121212",

  warn: "#FDE047",
  warnBg: "#2C2610",
  warnText: "#FDE047",
  onWarn: "#121212",

  info: "#60A5FA",
  infoSoft: "#132139",
  infoText: "#60A5FA",
  onInfo: "#121212",
};

export function getColors(scheme: string | null | undefined): ThemeColors {
  return scheme === "dark" ? darkColors : lightColors;
}

/* ── Role-based accent logic ────────────────────────────────────────────
 * Guard    → orange + red   (urgency / visibility at the gate)
 * Admin    → blue           (control / data)
 * Resident → green + blue   (trust / approval)
 *
 * This only shifts the DECORATIVE accent of a role's surfaces. The universal
 * status colours (approve / warn / deny) are deliberately NOT part of this
 * map — a red badge means "denied" for every role and is never reused to
 * decorate a guard screen.
 */
export type AppRole = "resident" | "guard" | "admin";

export interface RoleAccent {
  /** Fill for the role's hero surfaces, active tab and primary CTA. */
  accent: ColorToken;
  /** Tint behind icons/chips on that role's screens. */
  accentSoft: ColorToken;
  /** Same role accent when rendered as text. AA-safe in both schemes. */
  accentText: ColorToken;
  /** Secondary emphasis, used sparingly for the role's high-signal chrome. */
  emphasis: ColorToken;
}

export const ROLE_ACCENTS: Record<AppRole, RoleAccent> = {
  guard: {
    accent: "primary",
    accentSoft: "primarySoft",
    accentText: "primaryText",
    emphasis: "deny",
  },
  admin: {
    accent: "info",
    accentSoft: "infoSoft",
    accentText: "infoText",
    emphasis: "accent",
  },
  resident: {
    accent: "approve",
    accentSoft: "approveBg",
    accentText: "approveText",
    emphasis: "info",
  },
};

/** Resolve a role's accent tokens to concrete hex values for the given scheme. */
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

/* ── Data-viz ────────────────────────────────────────────────────────────
 * Sequential ramp for heatmaps/intensity charts, light → dark. Built from the
 * Info family so charts stay on-palette and shift with the scheme. Index 0 is
 * the "no data" step and must read as empty, not as a low value.
 */
export function getChartScale(scheme: string | null | undefined): string[] {
  const c = getColors(scheme);
  return scheme === "dark"
    ? [c.surfaceAlt, c.infoSoft, "#2C4A7C", c.info, "#93C5FD"]
    : [c.surfaceAlt, c.infoSoft, "#93C5FD", c.info, c.infoText];
}

/** @deprecated prefer useThemeColors() so dark mode is respected. */
export const color = lightColors;
