import { create } from "zustand";

export type Role = "resident" | "guard" | "admin";

export interface Profile {
  id: string; // Clerk user id
  society_id: string;
  role: Role;
  flat_id: string | null;
  name: string;
  phone: string | null;
  expo_push_token: string | null;
}

export type ProfileStatus = "loading" | "linked" | "unlinked" | "failed";

interface SessionState {
  profile: Profile | null;
  profileStatus: ProfileStatus;
  profileError: string | null;
  profileRetryKey: number;
  setProfile: (profile: Profile | null) => void;
  setProfileLoading: () => void;
  setLinkedProfile: (profile: Profile) => void;
  setProfileUnlinked: () => void;
  setProfileFailed: (message: string) => void;
  resetProfile: () => void;
  retryProfile: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  profile: null,
  profileStatus: "loading",
  profileError: null,
  profileRetryKey: 0,
  setProfile: (profile) =>
    set({
      profile,
      profileStatus: profile ? "linked" : "loading",
      profileError: null,
    }),
  setProfileLoading: () =>
    set({ profile: null, profileStatus: "loading", profileError: null }),
  setLinkedProfile: (profile) =>
    set({ profile, profileStatus: "linked", profileError: null }),
  setProfileUnlinked: () =>
    set({ profile: null, profileStatus: "unlinked", profileError: null }),
  setProfileFailed: (profileError) =>
    set({ profile: null, profileStatus: "failed", profileError }),
  resetProfile: () =>
    set({ profile: null, profileStatus: "loading", profileError: null }),
  retryProfile: () =>
    set((state) => ({
      profile: null,
      profileStatus: "loading",
      profileError: null,
      profileRetryKey: state.profileRetryKey + 1,
    })),
}));
