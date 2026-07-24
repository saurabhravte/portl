/**
 * OTA update discipline:
 *   checkForUpdate → fetch → reload
 * Auto-checks on launch (production builds). Manual check remains on Profile.
 *
 * Rollback rehearsal:
 *   eas update:republish --channel production --group <previous-group-id>
 * Never ship native module changes over OTA — bump the runtime version and
 * cut a new build instead.
 */
import * as Updates from "expo-updates";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { captureError } from "./sentry";

export async function checkAndApplyUpdate(opts?: { silent?: boolean }) {
  if (__DEV__ || !Updates.isEnabled) {
    if (!opts?.silent)
      Alert.alert("Updates", "OTA updates are disabled in development.");
    return { available: false, fetched: false, error: null };
  }
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) {
      if (!opts?.silent) Alert.alert("Up to date", "You're on the latest version.");
      return { available: false, fetched: false, error: null };
    }
    await Updates.fetchUpdateAsync();
    if (!opts?.silent) {
      Alert.alert(
        "Update ready",
        "A new version of Portl has been downloaded. Restart now?",
        [
          { text: "Later", style: "cancel" },
          { text: "Restart", onPress: () => void Updates.reloadAsync() },
        ],
      );
    }
    return { available: true, fetched: true, error: null };
  } catch (err) {
    captureError(err, { where: "ota-check" });
    if (!opts?.silent) Alert.alert("Update check failed", "Try again later.");
    return {
      available: false,
      fetched: false,
      error: "Couldn’t check for updates.",
    };
  }
}

export async function applyFetchedUpdate() {
  if (__DEV__ || !Updates.isEnabled) return;
  try {
    await Updates.reloadAsync();
  } catch (err) {
    captureError(err, { where: "ota-reload" });
    Alert.alert("Could not restart", "Close and reopen Portl to finish updating.");
  }
}

/** Silent launch check; exposes whether a downloaded update is waiting. */
export function useOtaUpdateCheck() {
  const [ready, setReady] = useState(false);
  const [applying, setApplying] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    if (__DEV__ || !Updates.isEnabled) return;
    setChecking(true);
    setError(null);
    try {
      const result = await checkAndApplyUpdate({ silent: true });
      if (result.fetched) setReady(true);
      setError(result.error);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const apply = async () => {
    setApplying(true);
    try {
      await applyFetchedUpdate();
    } finally {
      setApplying(false);
    }
  };

  return { ready, applying, checking, error, apply, retry: check };
}
