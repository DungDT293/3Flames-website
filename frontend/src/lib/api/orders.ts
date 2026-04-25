import { api } from "./client";
import type { Order, PaginatedResponse } from "@/types/api";

export interface PlaceOrderRequest {
  service_id: string;
  link: string;
  quantity: number;
}

export interface PlaceOrderResponse {
  message: string;
  order: {
    id: string;
    charge: string;
  };
  newBalance: string;
}

export async function placeOrder(
  data: PlaceOrderRequest,
): Promise<PlaceOrderResponse> {
  const res = await api.post<PlaceOrderResponse>("/orders", data);
  return res.data;
}

export async function fetchOrders(
  page: number = 1,
  limit: number = 20,
  status?: string,
): Promise<PaginatedResponse<Order>> {
  const params: Record<string, string | number> = { page, limit };
  if (status) params.status = status;
  const res = await api.get<PaginatedResponse<Order>>("/orders", { params });
  return res.data;
}
