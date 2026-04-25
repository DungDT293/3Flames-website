import { z } from 'zod';

export const createQrSchema = z.object({
  amount: z
    .number({ invalid_type_error: 'Amount must be a number' })
    .int('Amount must be a whole number')
    .positive('Amount must be positive')
    .min(10_000, 'Minimum deposit is 10,000 VND')
    .max(500_000_000, 'Maximum deposit is 500,000,000 VND per transaction'),
});

export type CreateQrPayload = z.infer<typeof createQrSchema>;
