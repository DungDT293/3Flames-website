import { create } from "zustand";
import type { User, UserRole } from "@/types/api";
import { setToken, clearToken, getToken } from "@/lib/api/client";
import { fetchProfile } from "@/lib/api/auth";

interface AuthState {
  user: User | null;
  balance: string;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (user: User, token: string) => void;
  logout: () => void;
  updateBalance: (newBalance: string) => void;
  loadProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => {
  // Listen for forced logout from Axios interceptor (401/403)
  if (typeof window !== "undefined") {
    window.addEventListener("auth:logout", () => {
      set({ user: null, balance: "0", isAuthenticated: false, isLoading: false });
    });
  }

  return {
    user: null,
    balance: "0",
    isAuthenticated: false,
    isLoading: true,

    login: (user, token) => {
      setToken(token);
      set({
        user,
        balance: user.balance || "0",
        isAuthenticated: true,
        isLoading: false,
      });
    },

    logout: () => {
      clearToken();
      set({ user: null, balance: "0", isAuthenticated: false, isLoading: false });
    },

    updateBalance: (newBalance) => {
      set({ balance: newBalance });
    },

    loadProfile: async () => {
      const token = getToken();
      if (!token) {
        set({ user: null, balance: "0", isAuthenticated: false, isLoading: false });
        return;
      }

      try {
        const profile = await fetchProfile();
        set({
          user: {
            id: profile.id,
            email: profile.email,
            username: profile.username,
            phone: profile.phone ?? null,
            role: profile.role as UserRole,
            status: profile.status as "ACTIVE" | "SUSPENDED" | "BANNED",
          },
          balance: profile.balance,
          isAuthenticated: true,
          isLoading: false,
        });
      } catch {
        clearToken();
        set({ user: null, balance: "0", isAuthenticated: false, isLoading: false });
      }
    },
  };
});
