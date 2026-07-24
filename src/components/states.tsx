import {
  AppIcon,
  type AppIconName,
  Button,
  EmptyState,
  QueryErrorState,
  Skeleton,
} from "@/components/ui";
import { classifyError } from "@/lib/errors";
import { signOutFromPortl } from "@/lib/signOut";
import { useSupabase } from "@/lib/supabase";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { useThemeColors } from "@/theme/useThemeColors";
import { useClerk } from "@clerk/expo";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Text, View } from "react-native";

/* ── Individual states ─────────────────────────────────────────────────
 * Each is small, self-contained, and uses the shared design tokens + icons
 * so every screen looks and behaves the same. #1 empty, #2 loading, #3 error,
 * #4 offline, #5 slow, #6 no-results, #7 permission, #8 session, #10 success.
 */

function StateShell({
  icon,
  iconColor,
  title,
  message,
  children,
}: {
  icon: AppIconName;
  iconColor?: string;
  title: string;
  message?: string;
  children?: React.ReactNode;
}) {
  const colors = useThemeColors();
  return (
    <View accessible className="items-center gap-3 p-8">
      <View className="h-14 w-14 items-center justify-center rounded-pill bg-surface-alt">
        <AppIcon name={icon} size={26} color={iconColor ?? colors.inkMuted} />
      </View>
      <Text className="text-center text-title text-ink">{title}</Text>
      {message ? (
        <Text className="text-center text-body text-ink-soft">{message}</Text>
      ) : null}
      {children}
    </View>
  );
}

/** #2 Loading — spinner + message, or a stack of skeleton rows for lists. */
export function LoadingState({
  message,
  skeletonRows,
}: {
  message?: string;
  skeletonRows?: number;
}) {
  const colors = useThemeColors();
  if (skeletonRows && skeletonRows > 0) {
    return (
      <View className="gap-3 p-1">
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <Skeleton key={i} />
        ))}
      </View>
    );
  }
  return (
    <View className="items-center gap-3 p-8">
      <ActivityIndicator color={colors.primary} />
      {message ? (
        <Text className="text-center text-body text-ink-soft">{message}</Text>
      ) : null}
    </View>
  );
}

/** #6 No search results. */
export function NoResults({ query }: { query?: string }) {
  return (
    <StateShell
      icon="search"
      title="No matches"
      message={
        query
          ? `Nothing matched “${query}”. Try a different search.`
          : "Try a different search or filter."
      }
    />
  );
}

/** #7 Permission denied (RLS / role blocked). */
export function PermissionDenied({ message }: { message?: string }) {
  const colors = useThemeColors();
  return (
    <StateShell
      icon="lock"
      iconColor={colors.warn}
      title="Access restricted"
      message={
        message ??
        "You don’t have permission to view this. If that seems wrong, ask your society admin."
      }
    />
  );
}

/** #4 Offline. */
export function OfflineState({ onRetry }: { onRetry?: () => void }) {
  const colors = useThemeColors();
  return (
    <StateShell
      icon="offline"
      iconColor={colors.deny}
      title="You’re offline"
      message="Check your connection — we’ll reload automatically when you’re back."
    >
      {onRetry ? (
        <Button
          title="Try again"
          variant="secondary"
          onPress={onRetry}
          className="mt-1"
        />
      ) : null}
    </StateShell>
  );
}

/** #8 Session expired — offers a clean re-auth. */
export function SessionExpired() {
  const colors = useThemeColors();
  const supabase = useSupabase();
  const { signOut } = useClerk();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  const reauth = async () => {
    setBusy(true);
    try {
      await signOutFromPortl(supabase, signOut);
      router.replace("/(auth)/sign-in" as never);
    } finally {
      setBusy(false);
    }
  };

  return (
    <StateShell
      icon="lock"
      iconColor={colors.deny}
      title="Session expired"
      message="For your security, please sign in again."
    >
      <Button title="Sign in again" loading={busy} onPress={() => void reauth()} />
    </StateShell>
  );
}

/** #10 Success — inline confirmation (use `toast.success` for transient ones). */
export function SuccessState({
  title = "All done",
  message,
  actionLabel,
  onAction,
}: {
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const colors = useThemeColors();
  return (
    <StateShell
      icon="check-circle"
      iconColor={colors.approve}
      title={title}
      message={message}
    >
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} className="mt-1" />
      ) : null}
    </StateShell>
  );
}

/* ── The drop-in ───────────────────────────────────────────────────────
 * Wrap any list/detail screen's async data. It picks the right state so a
 * screen only writes its happy path. Keep your `data.map(...)` as children.
 */
export interface QueryLike {
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  refetch: () => void;
  isRefetching?: boolean;
}

export function QueryState({
  query,
  empty,
  searchQuery,
  hasSearch,
  loadingRows = 3,
  emptyState,
  children,
}: {
  query: QueryLike;
  /** Caller computes emptiness, e.g. `!data?.length`. */
  empty?: boolean;
  /** Current search text — switches the empty state to "No results". */
  searchQuery?: string;
  /** Set true when a search/filter is active (alternative to searchQuery). */
  hasSearch?: boolean;
  loadingRows?: number;
  /** Custom empty node (defaults to a generic EmptyState). */
  emptyState?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { isOffline } = useOnlineStatus();

  if (query.isLoading) {
    return <LoadingState skeletonRows={loadingRows} />;
  }

  if (query.isError) {
    const { kind, message } = classifyError(query.error);
    if (kind === "offline" || (isOffline && kind === "unknown")) {
      return <OfflineState onRetry={query.refetch} />;
    }
    if (kind === "session") return <SessionExpired />;
    if (kind === "permission") return <PermissionDenied message={message} />;
    return (
      <QueryErrorState
        error={query.error}
        onRetry={query.refetch}
        isRetrying={query.isRefetching}
      />
    );
  }

  if (empty) {
    if (searchQuery || hasSearch) return <NoResults query={searchQuery} />;
    return <>{emptyState ?? <EmptyState title="Nothing here yet" />}</>;
  }

  return <>{children}</>;
}
