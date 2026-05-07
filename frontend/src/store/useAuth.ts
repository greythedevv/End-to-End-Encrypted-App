// src/store/useAuth.ts
import { create } from "zustand";
import { getPrivateKey } from "../lib/crypto/keyStorage";

type State = {
  token: string | null;
  refreshToken: string | null;
  userId: string | null;
  privateKey: CryptoKey | null;

  setSession: (data: {
    token: string;
    refreshToken: string;
    userId: string;
    privateKey: CryptoKey;
  }) => void;

  clearSession: () => void;
  loadPrivateKey: () => Promise<void>;
};

export const useAuth = create<State>((set) => ({
  // sessionStorage clears when tab closes — safer than localStorage
  // tokens are not sensitive enough to need IndexedDB but should not persist forever
  token: sessionStorage.getItem("token"),
  refreshToken: sessionStorage.getItem("refreshToken"),
  userId: sessionStorage.getItem("userId"),

  // Private key starts null — loaded from IndexedDB async via loadPrivateKey()
  privateKey: null,

  setSession: ({ token, refreshToken, userId, privateKey }) => {
    // Save tokens to sessionStorage (cleared when tab/browser closes)
    sessionStorage.setItem("token", token);
    sessionStorage.setItem("refreshToken", refreshToken);
    sessionStorage.setItem("userId", userId);

    // Private key is already saved to IndexedDB in LoginPage
    // Just put it in state so the app can use it immediately
    set({ token, refreshToken, userId, privateKey });
  },

  // Called on app load / page refresh to restore private key from IndexedDB
  loadPrivateKey: async () => {
    try {
      const key = await getPrivateKey();
      if (key) {
        set({ privateKey: key });
      }
    } catch (e) {
      console.error("Failed to load private key from IndexedDB:", e);
    }
  },

  clearSession: () => {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("refreshToken");
    sessionStorage.removeItem("userId");
    set({ token: null, refreshToken: null, userId: null, privateKey: null });
  },
}));
