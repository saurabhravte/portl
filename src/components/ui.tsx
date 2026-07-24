import {
  Bell,
  BellNotification,
  Book,
  Building,
  Calendar,
  Car,
  Check,
  CheckCircle,
  Clock,
  Community,
  CreditCard,
  DeliveryTruck,
  Download,
  Google,
  Group,
  HalfMoon,
  HomeSimple,
  Iconoir,
  List,
  LogOut,
  MoneySquare,
  NavArrowLeft,
  NavArrowRight,
  Palette,
  QrCode,
  Settings,
  ShieldCheck,
  SunLight,
  Swimming,
  Tools,
  User,
  UserPlus,
  WarningTriangle,
  Wrench,
  Xmark,
} from "iconoir-react-native";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";
import { useThemeColors } from "@/theme/useThemeColors";

const StyledSafeAreaView = withUniwind(SafeAreaView);

export function Screen({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <StyledSafeAreaView
      className={`flex-1 bg-paper ${className ?? ""}`}
      edges={["top"]}
    >
      {children}
    </StyledSafeAreaView>
  );
}

/* ── Icons (Iconoir) ───────────────────────────────────────────────────
 * One semantic name per concept; swap the mapping here to restyle the
 * whole app. Icons from https://iconoir.com
 */
type IconoirComponent = typeof Iconoir;

const ICONS = {
  home: HomeSimple,
  visitors: Group,
  "visitor-add": UserPlus,
  community: Building,
  payments: CreditCard,
  invoice: MoneySquare,
  download: Download,
  close: Xmark,
  profile: User,
  person: User,
  bell: Bell,
  "bell-active": BellNotification,
  back: NavArrowLeft,
  next: NavArrowRight,
  complaints: WarningTriangle,
  amenities: Swimming,
  polls: List,
  directory: Book,
  helpdesk: Wrench,
  notices: WarningTriangle,
  history: Clock,
  calendar: Calendar,
  shield: ShieldCheck,
  qr: QrCode,
  delivery: DeliveryTruck,
  cab: Car,
  check: Check,
  "check-circle": CheckCircle,
  settings: Settings,
  sun: SunLight,
  moon: HalfMoon,
  theme: Palette,
  logout: LogOut,
  google: Google,
  tools: Tools,
  communityPeople: Community,
} satisfies Record<string, IconoirComponent>;

export type AppIconName = keyof typeof ICONS;

export function AppIcon({
  name,
  color,
  size = 24,
  strokeWidth = 1.8,
}: {
  name: AppIconName;
  color?: string;
  size?: number;
  strokeWidth?: number;
}) {
  const colors = useThemeColors();
  const Icon = ICONS[name];
  return (
    <Icon
      width={size}
      height={size}
      color={color ?? colors.ink}
      strokeWidth={strokeWidth}
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

const btnBg: Record<ButtonVariant, string> = {
  primary: "bg-primary",
  secondary: "bg-surface-alt",
  ghost: "bg-transparent border border-border",
  approve: "bg-primary",
  deny: "bg-deny",
  "deny-outline": "bg-transparent border border-deny",
};

const btnFg: Record<ButtonVariant, string> = {
  primary: "text-on-primary",
  secondary: "text-ink",
  ghost: "text-ink",
  approve: "text-on-primary",
  deny: "text-on-primary",
  "deny-outline": "text-deny",
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

const badgeTone: Record<
  "neutral" | "approve" | "deny" | "warn" | "ink" | "primary" | "accent",
  { bg: string; fg: string }
> = {
  neutral: { bg: "bg-surface-alt", fg: "text-ink-soft" },
  approve: { bg: "bg-approve-bg", fg: "text-approve" },
  deny: { bg: "bg-deny-bg", fg: "text-deny" },
  warn: { bg: "bg-warn-bg", fg: "text-warn" },
  ink: { bg: "bg-ink", fg: "text-inverse" },
  primary: { bg: "bg-primary-soft", fg: "text-primary" },
  // Vibrant 10% accent — reserved for "wow" / high-signal chips.
  accent: { bg: "bg-accent-soft", fg: "text-accent" },
};

export function Badge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: keyof typeof badgeTone;
}) {
  const t = badgeTone[tone];
  return (
    <View className={`self-start rounded-pill px-3 py-1 ${t.bg}`}>
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
      <Text className="font-bold text-primary" style={{ fontSize: size * 0.36 }}>
        {initials}
      </Text>
    </View>
  );
}

/* ── Forms ───────────────────────────────────────────────────────────── */

export function Field(
  props: TextInputProps & { label?: string; className?: string },
) {
  const { label, className, ...rest } = props;
  return (
    <View className="gap-1">
      {label ? <Text className="text-label text-ink">{label}</Text> : null}
      <TextInput
        placeholderTextColorClassName="text-ink-faint"
        className={`min-h-11 rounded-md border border-border bg-surface-alt px-4 text-base text-ink ${className ?? ""}`}
        {...rest}
      />
    </View>
  );
}

/* ── States ──────────────────────────────────────────────────────────── */

export function EmptyState({
  title,
  hint,
  actionLabel,
  onAction,
}: {
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View className="items-center gap-2 p-8">
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
