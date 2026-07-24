import type { AppSupabaseClient } from "@/lib/supabase";
import { guardDeviceSchema, parseInput, uuidSchema } from "@/lib/validation";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const DEVICE_ID_KEY = "portl.guard-device-id.v1";
let deviceIdPromise: Promise<string> | null = null;

export function getGuardDeviceId() {
  if (!deviceIdPromise) {
    deviceIdPromise = (async () => {
      const stored = await SecureStore.getItemAsync(DEVICE_ID_KEY);
      if (stored) return stored;
      const created = Crypto.randomUUID();
      await SecureStore.setItemAsync(DEVICE_ID_KEY, created);
      return created;
    })();
  }
  return deviceIdPromise;
}

export async function registerGuardDeviceSession(
  supabase: AppSupabaseClient,
  pushToken?: string | null,
) {
  const deviceId = await getGuardDeviceId();
  const input = parseInput(guardDeviceSchema, {
    deviceId,
    deviceName: Device.deviceName ?? `${Platform.OS} device`,
    pushToken,
  });
  const { error } = await supabase.rpc("register_guard_device", {
    p_device_id: input.deviceId,
    p_device_name: input.deviceName,
    p_gate_id: undefined,
    p_push_token: input.pushToken ?? undefined,
  });
  if (error) throw error;
  return deviceId;
}

export async function heartbeatGuardDeviceSession(supabase: AppSupabaseClient) {
  const deviceId = parseInput(uuidSchema, await getGuardDeviceId());
  const { data, error } = await supabase.rpc("heartbeat_guard_device", {
    p_device_id: deviceId,
  });
  if (error) throw error;
  if (!data) throw new Error("This guard device is not active.");
}

export async function signOutGuardDeviceSession(supabase: AppSupabaseClient) {
  const deviceId = parseInput(uuidSchema, await getGuardDeviceId());
  const { error } = await supabase.rpc("sign_out_guard_device", {
    p_device_id: deviceId,
  });
  if (error) throw error;
}
