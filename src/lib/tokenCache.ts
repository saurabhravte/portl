/**
 * Persistent Clerk session cache (Gmail-style stay signed in).
 * Uses SecureStore so tokens survive app restarts and background kills.
 */
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const OPTIONS: SecureStore.SecureStoreOptions =
  Platform.OS === "ios"
    ? { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }
    : {};

export const tokenCache = {
  async getToken(key: string) {
    try {
      return await SecureStore.getItemAsync(key, OPTIONS);
    } catch {
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      await SecureStore.setItemAsync(key, value, OPTIONS);
    } catch {
      // SecureStore unavailable (web / restricted device) — session lasts this launch only.
    }
  },
  async clearToken(key: string) {
    try {
      await SecureStore.deleteItemAsync(key, OPTIONS);
    } catch {
      // no-op
    }
  },
};
