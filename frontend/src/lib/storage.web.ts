import type { TokenStorage } from "./session-core";

// Deliberately scoped to this loaded app. A page refresh drops the owner's key.
// Never use localStorage, sessionStorage, cookies, IndexedDB or URL parameters.
let currentToken: string | null = null;

export const tokenStorage: TokenStorage = {
  loadToken: async () => currentToken,
  saveToken: async (token) => {
    currentToken = token;
  },
  clearToken: async () => {
    currentToken = null;
  },
};
