import * as SecureStore from "expo-secure-store";
import type { TokenStorage } from "./session-core";

const ownerKey = "emergency-qr-v1.owner-token";
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

// Errors propagate to SessionController, which keeps the in-memory key and
// reports the actual persistence failure instead of claiming it was saved.
export const tokenStorage: TokenStorage = {
  loadToken: () => SecureStore.getItemAsync(ownerKey, options),
  saveToken: (token) => SecureStore.setItemAsync(ownerKey, token, options),
  clearToken: () => SecureStore.deleteItemAsync(ownerKey, options),
};
