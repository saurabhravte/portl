import {
  DEFAULT_VISITOR_EXPIRY_MS,
  useVisitorExpiryMs,
} from "@/features/community/hooks";
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";

/**
 * Live countdown + progress bar on the approval card (review §5.2).
 * The expiry window is no longer hardcoded to 2 minutes here — it reads
 * societies.settings.visitorExpiryMinutes (the same value the pg_cron
 * expiry job uses via visitor_expiry_minutes(), migration 0025), so the
 * client and the database can never drift apart.
 */
export function Countdown({
  createdAt,
  expiryMs,
}: {
  createdAt: string;
  /** Override for tests/storybook; defaults to the society setting. */
  expiryMs?: number;
}) {
  const societyExpiryMs = useVisitorExpiryMs();
  const windowMs = expiryMs ?? societyExpiryMs ?? DEFAULT_VISITOR_EXPIRY_MS;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = Math.max(
    0,
    new Date(createdAt).getTime() + windowMs - now,
  );
  const secs = Math.ceil(remaining / 1000);
  const mm = Math.floor(secs / 60);
  const ss = String(secs % 60).padStart(2, "0");
  const pct = Math.max(0, Math.min(1, remaining / windowMs));
  const urgent = secs <= 30;

  if (remaining <= 0) {
    return (
      <Text className="text-caption text-ink-muted">
        Expired — the guard can retry from the gate.
      </Text>
    );
  }

  return (
    <View className="gap-1">
      <Text className={`text-caption ${urgent ? "text-deny" : "text-ink-muted"}`}>
        Auto-expires in {mm}:{ss}
      </Text>
      <View className="h-1 w-full overflow-hidden rounded-pill bg-surface-alt">
        <View
          className={`h-full rounded-pill ${urgent ? "bg-deny" : "bg-ink"}`}
          style={{ width: `${pct * 100}%` }}
        />
      </View>
    </View>
  );
}
