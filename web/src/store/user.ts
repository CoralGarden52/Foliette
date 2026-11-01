import { create } from "zustand";
import { api } from "../api";
import type { User } from "../types";

interface AuthState {
  user: User | null;
  loading: boolean;
  init: () => Promise<void>;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,

  init: async () => {
    try {
      const { user } = await api.me();
      set({ user, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },

  setUser: (user) => set({ user }),

  logout: async () => {
    await api.logout();
    set({ user: null });
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener("foliette:unauthorized", () => {
    useAuth.setState({ user: null });
  });
}
