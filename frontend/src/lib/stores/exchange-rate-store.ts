import { create } from "zustand";
import { fetchExchangeRate, type ExchangeRate } from "@/lib/api/exchange-rate";

interface ExchangeRateState {
  rate: ExchangeRate | null;
  isLoading: boolean;
  error: string | null;
  loadRate: () => Promise<void>;
}

export const useExchangeRateStore = create<ExchangeRateState>((set) => ({
  rate: null,
  isLoading: false,
  error: null,
  loadRate: async () => {
    set({ isLoading: true, error: null });
    try {
      const rate = await fetchExchangeRate();
      set({ rate, isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to load exchange rate",
        rate: {
          base: "USD",
          quote: "VND",
          rate: "25000",
          source: "fallback",
          updatedAt: new Date().toISOString(),
        },
      });
    }
  },
}));
