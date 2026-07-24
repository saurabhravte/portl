import * as Notifications from "expo-notifications";
import {
  clearTrackedDevicePushToken,
  registerPushToken,
  unregisterCurrentDevicePushToken,
} from "../notifications";
import { createMockSupabase } from "../../../test/jest/mockSupabase";

jest.mock("expo-device", () => ({ isDevice: true }));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { eas: { projectId: "project-id" } } },
  },
}));

describe("push device registration", () => {
  beforeEach(clearTrackedDevicePushToken);

  it("requests permission when needed and registers the installation token", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: "undetermined",
    });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: "granted",
    });
    const rpc = jest.fn(async () => ({ data: true, error: null }));
    const supabase = createMockSupabase(rpc);

    await expect(
      registerPushToken(supabase as never, "user-a"),
    ).resolves.toBe("ExpoPushToken[test-device]");
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledWith({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    expect(rpc).toHaveBeenCalledWith("register_push_token", {
      p_token: "ExpoPushToken[test-device]",
      p_platform: expect.any(String),
    });
  });

  it("sign-out removes only the token tracked for this device", async () => {
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValueOnce({
      data: "ExpoPushToken[device-b]",
    });
    const rpc = jest.fn(async () => ({ data: true, error: null }));
    const supabase = createMockSupabase(rpc);
    await registerPushToken(supabase as never, "same-user");

    await expect(
      unregisterCurrentDevicePushToken(supabase as never),
    ).resolves.toBe(true);
    expect(rpc).toHaveBeenLastCalledWith("unregister_push_token", {
      p_token: "ExpoPushToken[device-b]",
    });
    expect(rpc).not.toHaveBeenCalledWith("unregister_push_token", {
      p_token: "ExpoPushToken[other-device]",
    });
  });
});
