import { RecoverableSignOutError, runSignOut } from "../signOut";

jest.mock("../notifications", () => ({
  unregisterCurrentDevicePushToken: jest.fn(),
}));
jest.mock("../offline", () => ({
  clearGateQueueForSessionChange: jest.fn(),
}));
jest.mock("../../stores/session", () => ({
  useSessionStore: { getState: () => ({ resetProfile: jest.fn() }) },
}));

describe("shared sign-out sequence", () => {
  it("unregisters the device before clearing and signing out", async () => {
    const calls: string[] = [];
    await runSignOut({
      unregister: async () => {
        calls.push("unregister");
      },
      clearLocalSession: () => calls.push("clear"),
      clerkSignOut: async () => {
        calls.push("clerk");
      },
    });
    expect(calls).toEqual(["unregister", "clear", "clerk"]);
  });

  it("keeps the session intact when token unregistration is recoverable", async () => {
    const clearLocalSession = jest.fn();
    const clerkSignOut = jest.fn();
    await expect(
      runSignOut({
        unregister: async () => {
          throw new Error("ExpoPushToken[do-not-leak]");
        },
        clearLocalSession,
        clerkSignOut,
      }),
    ).rejects.toBeInstanceOf(RecoverableSignOutError);
    expect(clearLocalSession).not.toHaveBeenCalled();
    expect(clerkSignOut).not.toHaveBeenCalled();
  });

  it("does not expose token values in recoverable errors", async () => {
    await expect(
      runSignOut({
        unregister: async () => {
          throw new Error("ExpoPushToken[secret]");
        },
        clearLocalSession: jest.fn(),
        clerkSignOut: jest.fn(),
      }),
    ).rejects.not.toThrow("secret");
  });
});
