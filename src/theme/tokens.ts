/**
 * JS-only colour tokens for APIs that cannot take Uniwind classNames
 * (StatusBar, tabBarStyle, ActivityIndicator, Razorpay sheet, SVG charts).
 * UI styling lives in `src/global.css` + `className`.
 *
 * These MIRROR the CSS variables in global.css exactly. `tokens.parity.test.ts`
 * parses both files and fails if they ever drift, because a mismatch here is
 * invisible in review and shows up as one wrong-coloured spinner in dark mode.
 *
 * Brand direction: Portl claret (Primary/CTA) with teal as the secondary
 * accent, on a warm paper background.
 *
 * Three families, do not mix them up:
 *   <role>      FILL. Backgrounds, borders, icons, chart series.
 *   <role>Text  the same role used AS TEXT on paper/surface. Required in
 *               light mode, where several fills fail AA as text.
 *   on<Role>    label drawn on top of the fill.
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
  primary: "#9A1343",
  primarySoft: "#F3E8DC",
  primaryText: "#9A1343",
  onPrimary: "#FFFFFF",

  accent: "#0084A1",
  accentStrong: "#00647A",
  accentSoft: "#F3E8DC",
  accentText: "#005F73",
  onAccent: "#FFFFFF",

  paper: "#FAF6F0",
  surface: "#FFFFFF",
  surfaceAlt: "#F3E8DC",
  border: "#E3D8CC",
  borderStrong: "#8A7568",

  ink: "#211C1E",
  inkSoft: "#443A3D",
  inkMuted: "#6E625D",
  inkFaint: "#A2938C",
  inverse: "#FFFFFF",

  approve: "#1A6B42",
  approveBg: "#DCEFE3",
  approveText: "#1A6B42",
  onApprove: "#FFFFFF",

  deny: "#B3261E",
  denyBg: "#FBE2DF",
  denyText: "#B3261E",
  onDeny: "#FFFFFF",

  warn: "#E69A28",
  warnBg: "#F3E8DC",
  warnText: "#7A4E0F",
  onWarn: "#211C1E",

  info: "#00647A",
  infoSoft: "#F3E8DC",
  infoText: "#005F73",
  onInfo: "#FFFFFF",

  onboardBg: "#FFFFFF",
  onboardInk: "#000000",
  onboardInkMuted: "#5C5C5C",
  onboardCta: "#000000",
  onOnboardCta: "#FFFFFF",
  onboardDot: "#D4D4D4",
  onboardBorder: "#E6E6E6",
};

export const darkColors: ThemeColors = {
  primary: "#D82862",
  primarySoft: "#38202B",
  primaryText: "#F06292",
  onPrimary: "#FFFFFF",

  accent: "#00A5C8",
  accentStrong: "#00A5C8",
  accentSoft: "#38202B",
  accentText: "#00A5C8",
  onAccent: "#161418",

  paper: "#161418",
  surface: "#231F26",
  surfaceAlt: "#38202B",
  border: "#3A343D",
  borderStrong: "#635969",

  ink: "#F6ECE0",
  inkSoft: "#D8CCC2",
  inkMuted: "#AFA29A",
  inkFaint: "#7D7278",
  inverse: "#161418",

  approve: "#5FD39A",
  approveBg: "#14301F",
  approveText: "#5FD39A",
  onApprove: "#161418",

  deny: "#F2938C",
  denyBg: "#351A18",
  denyText: "#F2938C",
  onDeny: "#161418",

  warn: "#E69A28",
  warnBg: "#38202B",
  warnText: "#E69A28",
  onWarn: "#161418",

  info: "#00A5C8",
  infoSoft: "#38202B",
  infoText: "#00A5C8",
  onInfo: "#161418",

  onboardBg: "#000000",
  onboardInk: "#FFFFFF",
  onboardInkMuted: "#A8A8A8",
  onboardCta: "#FFFFFF",
  onOnboardCta: "#000000",
  onboardDot: "#3D3D3D",
  onboardBorder: "#262626",
};

export function getColors(scheme: string | null | undefined): ThemeColors {
  return scheme === "dark" ? darkColors : lightColors;
}

/* -- Spacing scale (Phase 3.1) -----------------------------------------
 * Mirrors --spacing-* in global.css. For the rare RN API that needs a
 * number (FlatList offsets, scroll insets, SVG geometry). Layout in JSX
 * uses the Tailwind spacing classes, never these.
 */
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

/* -- Elevation (Phase 3.1) ---------------------------------------------
 * Two steps, expressed as RN shadow props so every raised surface in the
 * app is one of exactly two shapes.
 */
export const ELEVATION = {
  1: {
    shadowColor: "#000000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  2: {
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;

/* -- Role accents (Phase 5.5) -------------------------------------------
 * ONE CTA COLOUR FOR THE WHOLE APP.
 *
 * This map used to give each role its own `accent`, which was also used for
 * that role's primary CTA: claret for guards, teal for admins, green for
 * residents. Three different "primary" buttons is exactly what Phase 5.5
 * forbids, and it also meant the approve-green was doing double duty as both
 * "this is the resident theme" and "this action approves something".
 *
 * `accent` is now `primary` for every role -- the CTA is claret everywhere.
 * Roles are distinguished only by `emphasis`, which is for decorative chrome
 * (hero tint, active tab underline) and never for a button.
 */
export type AppRole = "resident" | "guard" | "admin";

export interface RoleAccent {
  /** Primary CTA fill. Identical across roles by design -- do not vary it. */
  accent: ColorToken;
  /** Tint behind icons/chips on that role's screens. */
  accentSoft: ColorToken;
  /** The CTA colour rendered as text. AA-safe in both schemes. */
  accentText: ColorToken;
  /** Decorative role signal. Chrome only, never a button fill. */
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

/* -- Data-viz -----------------------------------------------------------
 * Sequential ramp for heatmaps/intensity charts, light -> dark. Index 0 is
 * the "no data" step and must read as empty, not as a low value.
 *
 * The two mid-steps used to be hardcoded Tailwind blues (#2C4A7C, #93C5FD)
 * left over from the previous palette -- the only off-token colours left in
 * src/. They are now interpolated from the teal family so the ramp shifts
 * with the theme and `audit:design` stays clean.
 */
const CHART_MID = {
  light: ["#7FC1D0", "#3FA3B9"],
  dark: ["#00566B", "#4FC3DD"],
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
