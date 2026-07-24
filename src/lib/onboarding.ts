import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

const ONBOARDING_KEY = "portl.onboarding.completed.v2";

interface OnboardingState {
  ready: boolean;
  completed: boolean;
  hydrate: () => Promise<void>;
  complete: () => Promise<void>;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  ready: false,
  completed: false,
  hydrate: async () => {
    try {
      const value = await AsyncStorage.getItem(ONBOARDING_KEY);
      set({ ready: true, completed: value === "1" });
    } catch {
      set({ ready: true, completed: false });
    }
  },
  complete: async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, "1");
    set({ ready: true, completed: true });
  },
}));

export async function hasCompletedOnboarding(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function markOnboardingComplete(): Promise<void> {
  await useOnboardingStore.getState().complete();
}
