import { api } from "./client";

export interface ExchangeRate {
  base: "USD";
  quote: "VND";
  rate: string;
  source: "live" | "cache" | "fallback";
  updatedAt: string;
}

export async function fetchExchangeRate(): Promise<ExchangeRate> {
  const res = await api.get<ExchangeRate>("/exchange-rate");
  return res.data;
}
