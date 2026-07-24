import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { encryptedGateQueueStorage } from "../encryptedQueueStorage";
import { makeQueuedAction } from "../offlineQueue";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device-only",
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

jest.mock("expo-crypto", () => {
  class Key {
    static generate = jest.fn(async () => new Key());
    static import = jest.fn(async () => new Key());
    encoded = jest.fn(async () => "test-key");
  }
  return {
    AESEncryptionKey: Key,
    AESSealedData: {
      fromCombined: jest.fn((ciphertext: string) => ({ ciphertext })),
    },
    aesEncryptAsync: jest.fn(async (bytes: Uint8Array) => ({
      combined: async () => Buffer.from(bytes).toString("base64"),
    })),
    aesDecryptAsync: jest.fn(async ({ ciphertext }: { ciphertext: string }) =>
      Uint8Array.from(Buffer.from(ciphertext, "base64")),
    ),
  };
});

describe("encrypted offline queue storage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("persists ciphertext and restores a replayable scoped action", async () => {
    let persisted: string | null = null;
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValue("test-key");
    (AsyncStorage.setItem as jest.Mock).mockImplementation(
      async (_name, value) => {
        persisted = value;
      },
    );
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async () => persisted);
    const item = makeQueuedAction(
      {
        userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        societyId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        kind: "mark_entry",
        payload: { requestId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
      },
      "11111111-1111-4111-8111-111111111111",
    );
    const state = JSON.stringify({ version: 1, state: { items: [item] } });

    await encryptedGateQueueStorage.setItem("queue", state);
    expect(persisted).not.toContain("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    await expect(encryptedGateQueueStorage.getItem("queue")).resolves.toContain(
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    );
  });

  it("rejects malformed plaintext before encryption", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("test-key");
    await expect(encryptedGateQueueStorage.setItem("queue", "{")).rejects.toThrow(
      "Offline queue state is invalid.",
    );
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith("queue", expect.anything());
  });

  it("drops malformed persisted envelopes", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue("{");
    await expect(encryptedGateQueueStorage.getItem("queue")).resolves.toBeNull();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("queue");
  });
});
