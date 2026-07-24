import type { AppSupabaseClient } from "./supabase";
import { unregisterCurrentDevicePushToken } from "./notifications";
import { clearGateQueueForSessionChange } from "./offline";
import { useSessionStore } from "../stores/session";

export class RecoverableSignOutError extends Error {
  constructor(message = "Could not sign out safely. Check your connection and try again.") {
    super(message);
    this.name = "RecoverableSignOutError";
  }
}

type SignOutDependencies = {
  unregister: () => Promise<unknown>;
  clearLocalSession: () => void;
  clerkSignOut: () => Promise<unknown>;
};

/** Ordered separately for deterministic tests and to prevent stale-device push. */
export async function runSignOut({
  unregister,
  clearLocalSession,
  clerkSignOut,
}: SignOutDependencies) {
  try {
    await unregister();
  } catch {
    throw new RecoverableSignOutError(
      "Could not disconnect notifications from this device. Check your connection and try again.",
    );
  }
  clearLocalSession();
  try {
    await clerkSignOut();
  } catch {
    throw new RecoverableSignOutError();
  }
}

export async function signOutFromPortl(
  supabase: AppSupabaseClient,
  clerkSignOut: () => Promise<unknown>,
) {
  const isGuard = useSessionStore.getState().profile?.role === "guard";
  return runSignOut({
    unregister: async () => {
      await unregisterCurrentDevicePushToken(supabase);
      if (isGuard) {
        const { signOutGuardDeviceSession } = await import("./guardDevice");
        await signOutGuardDeviceSession(supabase);
      }
    },
    clearLocalSession: () => {
      clearGateQueueForSessionChange();
      useSessionStore.getState().resetProfile();
    },
    clerkSignOut,
  });
}
