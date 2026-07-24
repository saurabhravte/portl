import NetInfo from "@react-native-community/netinfo";
import { useEffect } from "react";
import { AppState } from "react-native";
import { realtimeFallbackInterval } from "./realtimePolicy";

/** Refreshes on foreground/reconnect and polls only while realtime is unhealthy. */
export function useRealtimeRefreshPolicy({
  healthy,
  refresh,
}: {
  healthy: boolean;
  refresh: () => void;
}) {
  useEffect(() => {
    let online = true;
    let timer: ReturnType<typeof setInterval> | undefined;

    const updateTimer = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
      const interval = realtimeFallbackInterval(healthy, online);
      if (interval) timer = setInterval(refresh, interval);
    };

    const netInfo = NetInfo.addEventListener((state) => {
      const nextOnline =
        !!state.isConnected && state.isInternetReachable !== false;
      const reconnected = !online && nextOnline;
      online = nextOnline;
      updateTimer();
      if (reconnected) refresh();
    });
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    void NetInfo.fetch().then((state) => {
      online = !!state.isConnected && state.isInternetReachable !== false;
      updateTimer();
    });

    return () => {
      if (timer) clearInterval(timer);
      netInfo();
      appState.remove();
    };
  }, [healthy, refresh]);
}
