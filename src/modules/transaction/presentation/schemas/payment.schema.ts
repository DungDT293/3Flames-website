import { z } from 'zod';

export const createQrSchema = z.object({
  amount: z
    .number({ invalid_type_error: 'Amount must be a number' })
    .int('Amount must be a whole number')
    .positive('Amount must be positive')
    .min(10_000, 'Minimum deposit is 10,000 VND'),
});

export type CreateQrPayload = z.infer<typeof createQrSchema>;
