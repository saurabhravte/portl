import * as Updates from "expo-updates";
import { Alert } from "react-native";
import { applyFetchedUpdate, checkAndApplyUpdate } from "../ota";
import { captureError } from "../sentry";

jest.mock("../sentry", () => ({
  captureError: jest.fn(),
}));

describe("OTA failure and rollback-safe behavior", () => {
  const runtime = globalThis as typeof globalThis & { __DEV__: boolean };
  const originalDev = runtime.__DEV__;

  beforeEach(() => {
    runtime.__DEV__ = false;
    jest.spyOn(Alert, "alert").mockImplementation(jest.fn());
  });

  afterAll(() => {
    runtime.__DEV__ = originalDev;
  });

  it("keeps the running bundle when update fetch fails", async () => {
    (Updates.checkForUpdateAsync as jest.Mock).mockResolvedValueOnce({
      isAvailable: true,
    });
    (Updates.fetchUpdateAsync as jest.Mock).mockRejectedValueOnce(
      new Error("invalid update"),
    );

    await expect(checkAndApplyUpdate()).resolves.toEqual({
      available: false,
      fetched: false,
      error: "Couldn’t check for updates.",
    });
    expect(Updates.reloadAsync).not.toHaveBeenCalled();
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
      where: "ota-check",
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      "Update check failed",
      "Try again later.",
    );
  });

  it("reports reload failure and leaves restart recovery to the user", async () => {
    (Updates.reloadAsync as jest.Mock).mockRejectedValueOnce(
      new Error("reload failed"),
    );
    await expect(applyFetchedUpdate()).resolves.toBeUndefined();
    expect(Alert.alert).toHaveBeenCalledWith(
      "Could not restart",
      "Close and reopen Portl to finish updating.",
    );
  });
});
