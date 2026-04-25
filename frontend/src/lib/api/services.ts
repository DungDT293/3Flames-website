import { api } from "./client";
import type { Service } from "@/types/api";

export interface ServicesResponse {
  count: number;
  categories: number;
  services: Record<string, Service[]>;
}

export async function fetchServices(): Promise<ServicesResponse> {
  const res = await api.get<ServicesResponse>("/services");
  return res.data;
}
