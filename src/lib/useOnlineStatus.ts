import NetInfo, {
  type NetInfoState,
} from "@react-native-community/netinfo";
import { useEffect, useRef, useState } from "react";

export interface OnlineStatus {
  /** No usable connection (disconnected, or connected but not reachable). */
  isOffline: boolean;
  /** Connected but on a slow link (2g / poor cellular). */
  isSlow: boolean;
}

function derive(state: NetInfoState | null): OnlineStatus {
  if (!state) return { isOffline: false, isSlow: false };
  const reachable = state.isInternetReachable;
  const isOffline = state.isConnected === false || reachable === false;

  let isSlow = false;
  if (state.type === "cellular") {
    const gen = state.details?.cellularGeneration;
    if (gen === "2g" || gen === "3g") isSlow = true;
  }
  return { isOffline, isSlow };
}

/** Live connectivity for banners and state components. */
export function useOnlineStatus(): OnlineStatus {
  const [status, setStatus] = useState<OnlineStatus>({
    isOffline: false,
    isSlow: false,
  });
  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setStatus(derive(s)));
    NetInfo.fetch().then((s) => setStatus(derive(s)));
    return () => unsub();
  }, []);
  return status;
}

/**
 * True once a load has been in flight longer than `ms` — lets a screen show a
 * "still working, slow connection" hint without flashing it on fast loads.
 */
export function useSlowLoad(active: boolean, ms = 4000): boolean {
  const [slow, setSlow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (active) {
      timer.current = setTimeout(() => setSlow(true), ms);
    } else {
      setSlow(false);
      if (timer.current) clearTimeout(timer.current);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [active, ms]);
  return slow;
}
