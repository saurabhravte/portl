import NetInfo from "@react-native-community/netinfo";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";
import { useRealtimeRefreshPolicy } from "../realtimeHealth";
import { REALTIME_FALLBACK_MS } from "../realtimePolicy";

describe("realtime fallback integration", () => {
  it("polls while disconnected, refreshes on reconnect, and cleans up", async () => {
    jest.useFakeTimers();
    let networkListener: (state: {
      isConnected: boolean;
      isInternetReachable: boolean;
    }) => void = () => undefined;
    const unsubscribe = jest.fn();
    (NetInfo.addEventListener as jest.Mock).mockImplementation((listener) => {
      networkListener = listener;
      return unsubscribe;
    });
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    });
    const removeAppState = jest.fn();
    jest.spyOn(AppState, "addEventListener").mockReturnValue({
      remove: removeAppState,
    } as never);
    const refresh = jest.fn();

    const { unmount } = await renderHook(() =>
      useRealtimeRefreshPolicy({ healthy: false, refresh }),
    );
    await waitFor(() => expect(NetInfo.fetch).toHaveBeenCalled());

    await act(async () => {
      jest.advanceTimersByTime(REALTIME_FALLBACK_MS);
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      networkListener({
        isConnected: false,
        isInternetReachable: false,
      });
      networkListener({ isConnected: true, isInternetReachable: true });
    });
    expect(refresh).toHaveBeenCalledTimes(2);

    await unmount();
    await waitFor(() => expect(unsubscribe).toHaveBeenCalled());
    expect(removeAppState).toHaveBeenCalled();
  });
});
