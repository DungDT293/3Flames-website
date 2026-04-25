import { api } from "./client";

export interface CreateQrResponse {
  qrUrl: string;
  memo: string;
  amount: number;
  transactionId: string;
}

export async function createPaymentQR(
  amount: number,
): Promise<CreateQrResponse> {
  const res = await api.post<CreateQrResponse>("/payments/create-qr", {
    amount,
  });
  return res.data;
}
