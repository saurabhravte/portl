import { useSession } from "@clerk/expo";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useMemo } from "react";
import type { Database } from "./database.types";
import { getGuardDeviceId } from "./guardDevice";

function getSupabaseConfig() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  return { url, anonKey, ready: Boolean(url && anonKey) };
}

export type AppSupabaseClient = SupabaseClient<Database>;

let _anon: AppSupabaseClient | null = null;

/** Anonymous client — lazy so an empty .env does not crash the bundle. */
export function getSupabaseAnon(): AppSupabaseClient {
  const { url, anonKey, ready } = getSupabaseConfig();
  if (!ready) {
    throw new Error(
      "Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env",
    );
  }
  if (!_anon) _anon = createClient<Database>(url, anonKey);
  return _anon;
}

/** @deprecated Prefer getSupabaseAnon() — kept for call sites that expect a value. */
export const supabaseAnon = new Proxy({} as AppSupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getSupabaseAnon(), prop, receiver);
  },
});

/** Authenticated client — attaches the Clerk session token to every request. */
export function useSupabase() {
  const { session } = useSession();
  const { url, anonKey, ready } = getSupabaseConfig();

  return useMemo(() => {
    if (!ready) {
      // Placeholder client — RootLayout should block before hooks run.
      // Still avoid createClient("") which throws immediately.
      return createClient<Database>("https://placeholder.supabase.co", "placeholder", {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: async () => new Response("{}", { status: 503 }) },
      });
    }
    return createClient<Database>(url, anonKey, {
      accessToken: async () => (await session?.getToken()) ?? null,
      global: {
        fetch: async (input, init) => {
          const headers = new Headers(init?.headers);
          headers.set("x-portl-device-id", await getGuardDeviceId());
          return fetch(input, { ...init, headers });
        },
      },
      realtime: { params: { eventsPerSecond: 5 } },
    });
  }, [session, url, anonKey, ready]);
}
