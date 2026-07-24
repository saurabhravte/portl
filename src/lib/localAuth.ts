import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";

export type LocalAuthResult =
  | { ok: true; method: "biometric" | "device_passcode" | "unavailable_skipped" }
  | { ok: false; reason: "canceled" | "failed" | "locked" };

/**
 * Step-up confirmation for sensitive actions (admin override, device revoke,
 * account deletion, IoT unlock). Uses the OS biometric / device passcode
 * prompt. On web (or when hardware is missing) we skip rather than block —
 * the server still enforces role + audit requirements.
 */
export async function confirmSensitiveAction(
  promptMessage = "Confirm this sensitive action",
): Promise<LocalAuthResult> {
  if (Platform.OS === "web") {
    return { ok: true, method: "unavailable_skipped" };
  }

  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = hasHardware
      ? await LocalAuthentication.isEnrolledAsync()
      : false;

    if (!hasHardware || !enrolled) {
      // Fall back to device PIN/pattern when biometrics aren't set up.
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage,
        cancelLabel: "Cancel",
        disableDeviceFallback: false,
        biometricsSecurityLevel: "weak",
      });
      if (result.success) {
        return { ok: true, method: "device_passcode" };
      }
      if (result.error === "user_cancel" || result.error === "system_cancel") {
        return { ok: false, reason: "canceled" };
      }
      if (result.error === "lockout") {
        return { ok: false, reason: "locked" };
      }
      // No passcode / not available — don't brick the flow on simulators.
      if (
        result.error === "not_available" ||
        result.error === "not_enrolled" ||
        result.error === "passcode_not_set"
      ) {
        return { ok: true, method: "unavailable_skipped" };
      }
      return { ok: false, reason: "failed" };
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
      biometricsSecurityLevel: "weak",
    });
    if (result.success) {
      return { ok: true, method: "biometric" };
    }
    if (result.error === "user_cancel" || result.error === "system_cancel") {
      return { ok: false, reason: "canceled" };
    }
    if (result.error === "lockout") {
      return { ok: false, reason: "locked" };
    }
    return { ok: false, reason: "failed" };
  } catch {
    // Native module missing (Expo Go / web) — allow server-side controls to decide.
    return { ok: true, method: "unavailable_skipped" };
  }
}

export function localAuthFailureMessage(result: Extract<LocalAuthResult, { ok: false }>) {
  if (result.reason === "canceled") return "Confirmation cancelled.";
  if (result.reason === "locked") {
    return "Too many failed attempts. Unlock your device and try again.";
  }
  return "Biometric confirmation failed.";
}
