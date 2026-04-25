import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/v1";
const TOKEN_KEY = "3f_token";

// ─────────────────────────────────────────────────────────────
// SINGLETON AXIOS CLIENT
//
// All API calls go through this instance. Interceptors handle:
//   REQUEST:  Auto-attach JWT from localStorage
//   RESPONSE: Auto-clear auth state on 401/403 and redirect
//             to /login (session expired, suspended, banned)
// ─────────────────────────────────────────────────────────────

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
  headers: {
    "Content-Type": "application/json",
  },
});

// ── REQUEST INTERCEPTOR ─────────────────────────────────────
// Attach JWT token to every outgoing request if present
api.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ── RESPONSE INTERCEPTOR ────────────────────────────────────
// Catch auth failures globally. When the backend returns:
//   401 — Token expired / invalid / missing
//   403 — Account suspended/banned (authMiddleware check)
//
// We nuke the local session and force redirect to /login.
// This guarantees suspended users are immediately ejected,
// matching Phase 3.5's anti-fraud instant session kill.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window !== "undefined" && axios.isAxiosError(error)) {
      const status = error.response?.status;

      const message = error.response?.data && typeof error.response.data === "object"
        ? (error.response.data as { error?: unknown }).error
        : undefined;
      const shouldEndSession = status === 401 || message === "Account suspended";

      if (shouldEndSession) {
        localStorage.removeItem(TOKEN_KEY);

        // Clear Zustand store via window event (decoupled from store import)
        window.dispatchEvent(new CustomEvent("auth:logout"));

        // Redirect to login — only if not already there
        if (!window.location.pathname.startsWith("/login")) {
          window.location.href = "/login";
        }
      }
    }

    return Promise.reject(error);
  },
);

// ── TOKEN HELPERS ───────────────────────────────────────────
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
