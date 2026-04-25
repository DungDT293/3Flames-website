import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark";
export type Language = "vi" | "en";
export type DisplayCurrency = "VND" | "USD";

interface PreferencesState {
  theme: Theme;
  language: Language;
  currency: DisplayCurrency;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setLanguage: (language: Language) => void;
  setCurrency: (currency: DisplayCurrency) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      language: "vi",
      currency: "VND",
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
      setLanguage: (language) => set({ language }),
      setCurrency: (currency) => set({ currency }),
    }),
    { name: "3f_preferences" },
  ),
);
