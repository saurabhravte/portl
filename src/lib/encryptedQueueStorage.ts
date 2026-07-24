import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
} from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import type { StateStorage } from "zustand/middleware";
import {
  makeEncryptedQueueEnvelope,
  parseEncryptedQueueEnvelope,
  parseQueueState,
} from "./offlineQueue";

const KEY_NAME = "portl.gate-queue.aes-key.v1";

function encodeUtf8(value: string) {
  const encoded = encodeURIComponent(value);
  const bytes: number[] = [];
  for (let index = 0; index < encoded.length; index += 1) {
    if (encoded[index] === "%") {
      bytes.push(Number.parseInt(encoded.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(encoded.charCodeAt(index));
    }
  }
  return new Uint8Array(bytes);
}

function decodeUtf8(bytes: Uint8Array) {
  let encoded = "";
  for (const byte of bytes) {
    encoded += byte < 0x80 ? String.fromCharCode(byte) : `%${byte.toString(16).padStart(2, "0")}`;
  }
  return decodeURIComponent(encoded);
}

async function getOrCreateKey() {
  const saved = await SecureStore.getItemAsync(KEY_NAME);
  if (saved) return AESEncryptionKey.import(saved, "base64");

  const key = await AESEncryptionKey.generate();
  await SecureStore.setItemAsync(KEY_NAME, await key.encoded("base64"), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return key;
}

export async function encryptQueueValue(value: string) {
  const key = await getOrCreateKey();
  const normalized = parseQueueState(value);
  if (!normalized) throw new Error("Offline queue state is invalid.");
  const sealed = await aesEncryptAsync(encodeUtf8(normalized), key);
  return makeEncryptedQueueEnvelope(
    (await sealed.combined("base64")) as string,
  );
}

export async function decryptQueueValue(value: string) {
  const ciphertext = parseEncryptedQueueEnvelope(value);
  if (!ciphertext) return null;
  const savedKey = await SecureStore.getItemAsync(KEY_NAME);
  if (!savedKey) return null;
  const key = await AESEncryptionKey.import(savedKey, "base64");
  const sealed = AESSealedData.fromCombined(ciphertext);
  const plaintext = (await aesDecryptAsync(sealed, key)) as Uint8Array;
  return parseQueueState(decodeUtf8(plaintext));
}

let pendingWrite: Promise<void> = Promise.resolve();

export const encryptedGateQueueStorage: StateStorage = {
  async getItem(name) {
    await pendingWrite.catch(() => undefined);
    const encrypted = await AsyncStorage.getItem(name);
    if (!encrypted) return null;
    try {
      const decrypted = await decryptQueueValue(encrypted);
      if (!decrypted) await AsyncStorage.removeItem(name);
      return decrypted;
    } catch {
      await AsyncStorage.removeItem(name);
      return null;
    }
  },
  setItem(name, value) {
    pendingWrite = pendingWrite
      .catch(() => undefined)
      .then(async () => {
        await AsyncStorage.setItem(name, await encryptQueueValue(value));
      });
    return pendingWrite;
  },
  async removeItem(name) {
    await pendingWrite.catch(() => undefined);
    await AsyncStorage.removeItem(name);
  },
};
