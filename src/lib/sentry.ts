/**
 * Crash reporting (sprint ticket #4 — P0).
 *
 * Sentry releases are tied to the exact EAS Update, so a crash maps to the
 * OTA that shipped it (review §5.4). Set EXPO_PUBLIC_SENTRY_DSN in .env /
 * EAS secrets; without it, Sentry is a silent no-op so local dev keeps
 * working.
 *
 * `@sentry/react-native` is a native module: it is NOT available in Expo Go
 * and evaluating it there can crash the bundle at import time. We therefore
 * lazy-require it only in custom/dev/preview/production builds AND only when a
 * DSN is configured. In Expo Go (or with no DSN) every function below is a
 * safe no-op, and `wrapRoot` returns the component untouched.
 */
import { isRunningInExpoGo } from "expo";
import * as Updates from "expo-updates";
import type * as SentryType from "@sentry/react-native";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();

// Active only in a native build (not Expo Go) with a DSN present.
const sentryEnabled = !!dsn && !isRunningInExpoGo();

let sentry: typeof SentryType | null = null;

function loadSentry(): typeof SentryType | null {
  if (!sentryEnabled) return null;
  if (sentry) return sentry;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sentry = require("@sentry/react-native") as typeof SentryType;
    return sentry;
  } catch {
    return null; // Expo Go / native module not linked.
  }
}

export function initSentry() {
  const Sentry = loadSentry();
  if (!Sentry || !dsn) return;
  Sentry.init({
    dsn,
    enabled: !__DEV__,
    tracesSampleRate: 0.2,
    // Map crashes to the exact OTA release.
    release: Updates.updateId ?? `embedded-${Updates.runtimeVersion ?? "dev"}`,
    dist: Updates.channel ?? "development",
  });
  Sentry.setTag("eas-update-id", Updates.updateId ?? "embedded");
  Sentry.setTag("eas-channel", Updates.channel ?? "none");
  Sentry.setTag("runtime-version", Updates.runtimeVersion ?? "unknown");
}

/** Breadcrumbs around gate mutations — the flows that must never fail. */
export function gateBreadcrumb(message: string, data?: Record<string, unknown>) {
  const Sentry = loadSentry();
  if (!Sentry) return;
  Sentry.addBreadcrumb({ category: "gate", level: "info", message, data });
}

export function captureError(err: unknown, context?: Record<string, unknown>) {
  const Sentry = loadSentry();
  if (!Sentry) {
    if (__DEV__) console.warn("[sentry:off]", err, context);
    return;
  }
  Sentry.captureException(err, { extra: context });
}

/** Wrap the root component so navigation/perf instrumentation attaches. */
export const wrapRoot = <P extends Record<string, unknown>>(
  component: React.ComponentType<P>,
): React.ComponentType<P> => {
  const Sentry = loadSentry();
  return Sentry ? Sentry.wrap(component) : component;
};
