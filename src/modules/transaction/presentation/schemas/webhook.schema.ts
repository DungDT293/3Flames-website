import { z } from 'zod';

export const paymentWebhookSchema = z.object({
  event: z.enum(['PAYMENT_COMPLETED', 'PAYMENT_FAILED', 'PAYMENT_PENDING']),
  payment_id: z.string().min(1),
  user_id: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().min(1).max(10),
  metadata: z.record(z.unknown()).optional(),
});

export type PaymentWebhookPayload = z.infer<typeof paymentWebhookSchema>;
