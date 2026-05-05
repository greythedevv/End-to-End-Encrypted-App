// src/store/useAuth.ts
import { create } from "zustand";

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
};

export const useAuth = create<State>((set) => ({
  token: localStorage.getItem("token"),
  refreshToken: localStorage.getItem("refreshToken"),
  userId: localStorage.getItem("userId"),
  privateKey: (window as any).__PRIVATE_KEY__ ?? null,

  setSession: ({ token, refreshToken, userId, privateKey }) => {
    localStorage.setItem("token", token);
    localStorage.setItem("refreshToken", refreshToken);
    localStorage.setItem("userId", userId);

    (window as any).__PRIVATE_KEY__ = privateKey;

    set({ token, refreshToken, userId, privateKey });
  },

  clearSession: () => {
    localStorage.clear();
    (window as any).__PRIVATE_KEY__ = null;
    set({ token: null, refreshToken: null, userId: null, privateKey: null });
  },
}));