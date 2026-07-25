import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";
import type { ColorToken } from "@/theme/tokens";
import { useResponsive } from "@/theme/useResponsive";
import { useThemeColors } from "@/theme/useThemeColors";

const StyledSafeAreaView = withUniwind(SafeAreaView);

/**
 * Standard screen chrome: safe-area top, optional keyboard avoidance, and an
 * optional centred max-width column so text does not run edge-to-edge on
 * tablets.
 *
 * `edges` defaults to top only because most screens sit inside a tab
 * navigator that already owns the bottom inset. Screens WITHOUT a tab bar
 * (modals, auth, full-bleed scanners) should pass `edges={["top", "bottom"]}`
 * or use `ScreenFooter` for a sticky CTA.
 */
export function Screen({
  children,
  className,
  edges = ["top"],
  keyboard = false,
  centered = false,
}: {
  children: React.ReactNode;
  className?: string;
  edges?: ("top" | "bottom" | "left" | "right")[];
  /** Wrap content so the keyboard pushes it up instead of covering inputs. */
  keyboard?: boolean;
  /** Cap and centre content width on large/tablet viewports. */
  centered?: boolean;
}) {
  const { contentMaxWidth, isWide } = useResponsive();

  let content = children;

  if (centered && isWide) {
    content = (
      <View className="flex-1 items-center">
        <View style={{ width: "100%", maxWidth: contentMaxWidth, flex: 1 }}>
          {children}
        </View>
      </View>
    );
  }

  if (keyboard) {
    content = (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {content}
      </KeyboardAvoidingView>
    );
  }

  return (
    <StyledSafeAreaView
      className={`flex-1 bg-paper ${className ?? ""}`}
      edges={edges}
    >
      {content}
    </StyledSafeAreaView>
  );
}

/**
 * Sticky bottom bar for primary actions. Adds the home-indicator inset to its
 * own padding so the CTA is never sat under the gesture bar — the reason a
 * fixed `pb-4` is not good enough on modern hardware.
 */
export function ScreenFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className={`border-t border-border bg-surface px-4 pt-3 ${className ?? ""}`}
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
    >
      {children}
    </View>
  );
}

/* ── Icons (@expo/vector-icons — Ionicons) ─────────────────────────────
 * One semantic name per concept; swap the mapping here to restyle the whole
 * app. Migrated from iconoir to @expo/vector-icons so icons ship with Expo
 * (no extra native module, works in Expo Go). Names: https://icons.expo.fyi
 */
const ICONS = {
  home: "home",
  visitors: "people",
  "visitor-add": "person-add",
  community: "business",
  payments: "card",
  invoice: "cash",
  download: "download",
  close: "close",
  profile: "person",
  person: "person",
  bell: "notifications-outline",
  "bell-active": "notifications",
  back: "chevron-back",
  next: "chevron-forward",
  complaints: "warning-outline",
  amenities: "water",
  polls: "list",
  directory: "book",
  helpdesk: "construct",
  notices: "megaphone-outline",
  history: "time-outline",
  calendar: "calendar-outline",
  shield: "shield-checkmark",
  qr: "qr-code",
  delivery: "cube-outline",
  cab: "car",
  check: "checkmark",
  "check-circle": "checkmark-circle",
  settings: "settings-outline",
  sun: "sunny",
  moon: "moon",
  theme: "color-palette-outline",
  logout: "log-out-outline",
  google: "logo-google",
  tools: "build-outline",
  communityPeople: "people-circle-outline",
  // Added for the app-state components (offline / search / permission / etc.)
  offline: "cloud-offline-outline",
  slow: "cellular-outline",
  search: "search",
  lock: "lock-closed-outline",
  alert: "alert-circle",
  inbox: "file-tray-outline",
  refresh: "refresh",
  mail: "mail-outline",
  phone: "call-outline",
  edit: "create-outline",
} as const;

export type AppIconName = keyof typeof ICONS;

export function AppIcon({
  name,
  color,
  size = 24,
}: {
  name: AppIconName;
  color?: string;
  size?: number;
  /** Accepted for backwards-compat with the old iconoir API; ignored. */
  strokeWidth?: number;
}) {
  const colors = useThemeColors();
  return (
    <Ionicons
      name={ICONS[name] as never}
      size={size}
      color={color ?? colors.ink}
    />
  );
}

/* ── Buttons ─────────────────────────────────────────────────────────── */

type ButtonVariant =
  | "primary"
  | "secondary"
  | "approve"
  | "deny"
  | "deny-outline"
  | "ghost";

/*
 * Phase 7.1 — `approve` used to be `bg-primary` with `text-on-primary`, i.e.
 * the brand CTA colour, not the approve colour. An "Approve" and a "Pay now"
 * button were visually identical, and the approve token was going unused
 * while approve-green appeared only as a badge. Each variant now uses its own
 * role pair.
 */
const btnBg: Record<ButtonVariant, string> = {
  primary: "bg-primary",
  secondary: "bg-surface-alt",
  ghost: "bg-transparent border border-border",
  approve: "bg-approve",
  deny: "bg-deny",
  "deny-outline": "bg-transparent border border-deny",
};

const btnFg: Record<ButtonVariant, string> = {
  primary: "text-on-primary",
  secondary: "text-ink",
  ghost: "text-ink",
  approve: "text-on-approve",
  deny: "text-on-deny",
  "deny-outline": "text-deny-text",
};

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  selected,
  className,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: "md" | "sm" | "guard";
  loading?: boolean;
  disabled?: boolean;
  selected?: boolean;
  className?: string;
}) {
  const colors = useThemeColors();
  const spinner =
    variant === "secondary" || variant === "ghost"
      ? colors.ink
      : variant === "deny-outline"
        ? colors.deny
        : colors.onPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{
        disabled: !!(disabled || loading),
        busy: !!loading,
        selected,
      }}
      onPress={onPress}
      disabled={disabled || loading}
      className={`items-center justify-center rounded-md px-4 ${
        size === "guard" ? "min-h-14 py-3" : size === "sm" ? "min-h-9 py-1.5" : "min-h-11 py-3"
      } ${btnBg[variant]} ${disabled ? "opacity-50" : "active:opacity-80"} ${className ?? ""}`}
    >
      {loading ? (
        <ActivityIndicator color={spinner} />
      ) : (
        <Text
          className={`font-semibold ${btnFg[variant]} ${
            size === "guard" ? "text-lg" : size === "sm" ? "text-caption" : "text-label"
          }`}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

/* ── Surfaces ────────────────────────────────────────────────────────── */

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View
      className={`gap-2 rounded-lg border border-border bg-surface p-4 ${className ?? ""}`}
    >
      {children}
    </View>
  );
}

/** Filled brand card — "Maintenance Due", "Outstanding Dues" (mockup). */
export function HeroCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View className={`gap-2 rounded-lg bg-primary p-4 ${className ?? ""}`}>
      {children}
    </View>
  );
}

/* ── Badges & chips ──────────────────────────────────────────────────── */

/**
 * Badge tones. `fg` is always a *-text token, never a raw fill — the fills
 * fail WCAG AA as text in light mode (orange 2.69:1, yellow 1.47:1).
 *
 * `icon` exists so a status is never conveyed by colour alone: the three
 * universal states carry a glyph as well as the label, which keeps them
 * readable for colour-blind users and in greyscale. Decorative tones
 * (neutral / primary / accent / ink) deliberately have no icon.
 */
const badgeTone: Record<
  "neutral" | "approve" | "deny" | "warn" | "info" | "ink" | "primary" | "accent",
  { bg: string; fg: string; icon?: AppIconName }
> = {
  neutral: { bg: "bg-surface-alt", fg: "text-ink-soft" },
  approve: { bg: "bg-approve-bg", fg: "text-approve-text", icon: "check-circle" },
  deny: { bg: "bg-deny-bg", fg: "text-deny-text", icon: "close" },
  warn: { bg: "bg-warn-bg", fg: "text-warn-text", icon: "alert" },
  info: { bg: "bg-info-soft", fg: "text-info-text", icon: "bell" },
  ink: { bg: "bg-ink", fg: "text-inverse" },
  primary: { bg: "bg-primary-soft", fg: "text-primary-text" },
  accent: { bg: "bg-accent-soft", fg: "text-accent-text" },
};

/** Resolved hex for a badge's foreground, for the icon glyph. */
const badgeIconColor: Record<string, ColorToken> = {
  approve: "approveText",
  deny: "denyText",
  warn: "warnText",
  info: "infoText",
};

export function Badge({
  label,
  tone = "neutral",
  showIcon = true,
}: {
  label: string;
  tone?: keyof typeof badgeTone;
  /** Set false only where the surrounding row already carries a status glyph. */
  showIcon?: boolean;
}) {
  const t = badgeTone[tone];
  const colors = useThemeColors();
  const iconToken = badgeIconColor[tone];
  return (
    <View
      className={`flex-row items-center gap-1 self-start rounded-pill px-3 py-1 ${t.bg}`}
    >
      {showIcon && t.icon ? (
        <AppIcon
          name={t.icon}
          size={12}
          color={iconToken ? colors[iconToken] : colors.inkSoft}
        />
      ) : null}
      <Text className={`text-caption ${t.fg}`}>{label}</Text>
    </View>
  );
}

/** Segmented filter chip — "All / Open / In Progress / Resolved". */
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      className={`rounded-pill px-4 py-2 ${
        selected ? "bg-primary" : "bg-surface-alt border border-border"
      } active:opacity-80`}
    >
      <Text
        className={`text-caption font-semibold ${
          selected ? "text-on-primary" : "text-ink-soft"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Quick-action tile: tinted rounded icon + label (mockup home grid). */
export function IconTile({
  icon,
  label,
  onPress,
  accent = false,
}: {
  icon: AppIconName;
  label: string;
  onPress: () => void;
  /** Use the vibrant accent (10% color) for high-signal actions like Security. */
  accent?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="items-center gap-1.5 active:opacity-70"
      style={{ width: 64 }}
    >
      <View
        className={`h-14 w-14 items-center justify-center rounded-md border border-border ${
          accent ? "bg-accent-soft" : "bg-primary-soft"
        }`}
      >
        <AppIcon
          name={icon}
          size={24}
          color={accent ? colors.accent : colors.primary}
        />
      </View>
      <Text className="text-caption text-ink-soft" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Initials avatar (visitor / profile rows). */
export function Avatar({
  name,
  size = 44,
}: {
  name?: string | null;
  size?: number;
}) {
  const initials = (name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <View
      className="items-center justify-center rounded-pill bg-primary-soft"
      style={{ width: size, height: size }}
    >
      <Text className="font-bold text-primary-text" style={{ fontSize: size * 0.36 }}>
        {initials}
      </Text>
    </View>
  );
}

/* ── Forms ───────────────────────────────────────────────────────────── */

export function Field(
  props: TextInputProps & {
    label?: string;
    className?: string;
    /** Inline validation message (#9). Pairs with useZodForm. */
    error?: string;
    /** Show an eye toggle when `secureTextEntry` is used. */
    secureToggle?: boolean;
    /** Icon inside the field, left of the text (Phase 6 reference design). */
    leadingIcon?: AppIconName;
  },
) {
  const {
    label,
    className,
    error,
    secureToggle,
    secureTextEntry,
    leadingIcon,
    ...rest
  } = props;
  const colors = useThemeColors();
  const [revealed, setRevealed] = React.useState(false);
  const isSecure = !!secureTextEntry && !(secureToggle && revealed);

  return (
    <View className="gap-1">
      {label ? <Text className="text-label text-ink">{label}</Text> : null}
      <View className="relative justify-center">
        {leadingIcon ? (
          <View
            className="absolute left-4 z-10"
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <AppIcon name={leadingIcon} size={18} color={colors.inkMuted} />
          </View>
        ) : null}
        <TextInput
          placeholderTextColorClassName="text-ink-faint"
          accessibilityState={{ disabled: rest.editable === false }}
          secureTextEntry={isSecure}
          className={`min-h-12 rounded-md border bg-surface-alt px-4 text-base text-ink ${
            leadingIcon ? "pl-11" : ""
          } ${secureToggle && secureTextEntry ? "pr-12" : ""} ${
            error ? "border-deny" : "border-border"
          } ${className ?? ""}`}
          {...rest}
        />
        {secureToggle && secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
            onPress={() => setRevealed((v) => !v)}
            className="absolute right-3 h-11 items-center justify-center px-1"
            hitSlop={8}
          >
            <Ionicons
              name={revealed ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={colors.inkMuted}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text accessibilityRole="alert" className="text-caption text-deny-text">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/* ── States ──────────────────────────────────────────────────────────── */

export function EmptyState({
  title,
  hint,
  actionLabel,
  onAction,
  icon,
}: {
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Optional illustration icon shown above the title. */
  icon?: AppIconName;
}) {
  const colors = useThemeColors();
  return (
    <View className="items-center gap-2 p-8">
      {icon ? (
        <View className="mb-1 h-14 w-14 items-center justify-center rounded-pill bg-surface-alt">
          <AppIcon name={icon} size={26} color={colors.inkMuted} />
        </View>
      ) : null}
      <Text className="text-title text-ink">{title}</Text>
      {hint ? (
        <Text className="text-center text-body text-ink-soft">{hint}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          title={actionLabel}
          variant="secondary"
          onPress={onAction}
          className="mt-2"
        />
      ) : null}
    </View>
  );
}

export function QueryErrorState({
  error,
  onRetry,
  isRetrying,
  title = "Couldn’t load this",
}: {
  error?: unknown;
  onRetry: () => void;
  isRetrying?: boolean;
  title?: string;
}) {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "Check your connection and try again.";
  return (
    <View
      accessible
      accessibilityRole="alert"
      className="items-center gap-2 p-8"
    >
      <Text className="text-center text-title text-ink">{title}</Text>
      <Text className="text-center text-body text-ink-soft">{message}</Text>
      <Button
        title="Try again"
        variant="secondary"
        loading={isRetrying}
        onPress={onRetry}
        className="mt-2"
      />
    </View>
  );
}

export function BackControl({
  label = "Back",
  onPress,
}: {
  label?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="min-h-11 self-start flex-row items-center gap-2 rounded-md pr-3"
    >
      <AppIcon name="back" size={20} />
      <Text className="text-label text-ink">{label}</Text>
    </Pressable>
  );
}

export function Skeleton({ height = 72 }: { height?: number }) {
  return <View className="mb-3 rounded-lg bg-surface-alt" style={{ height }} />;
}

export function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="mb-2 text-caption uppercase text-ink-muted">{children}</Text>
  );
}
