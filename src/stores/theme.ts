import AsyncStorage from "@react-native-async-storage/async-storage";
import { Appearance } from "react-native";
import { create } from "zustand";

export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "portl.themeMode";

interface ThemeState {
  mode: ThemeMode;
  ready: boolean;
  hydrate: () => Promise<void>;
  setMode: (mode: ThemeMode) => void;
}

function apply(mode: ThemeMode) {
  // null hands control back to the OS; Uniwind's CSS-variable dark block
  // (global.css) follows whatever Appearance reports.
  // RN maps "unspecified" back to the OS scheme (see Appearance.js).
  Appearance.setColorScheme(mode === "system" ? "unspecified" : mode);
}

/**
 * App-wide theme preference. Persisted, applied via Appearance so every
 * Uniwind token, StatusBar and tab bar re-theme without prop drilling.
 */
export const useThemeStore = create<ThemeState>((set) => ({
  mode: "system",
  ready: false,
  hydrate: async () => {
    try {
      const stored = (await AsyncStorage.getItem(STORAGE_KEY)) as ThemeMode | null;
      const mode: ThemeMode =
        stored === "light" || stored === "dark" ? stored : "system";
      apply(mode);
      set({ mode, ready: true });
    } catch {
      set({ ready: true });
    }
  },
  setMode: (mode) => {
    apply(mode);
    set({ mode });
    AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {});
  },
}));
