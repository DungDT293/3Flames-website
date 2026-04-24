import { z } from 'zod';

export const listUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(255).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED']).optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
});

export const adjustBalanceSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  type: z.enum(['ADD', 'DEDUCT']),
  description: z.string().min(1).max(500),
});

export const suspendUserSchema = z.object({
  reason: z.string().min(1, 'Reason is required').max(500),
});

export type ListUsersInput = z.infer<typeof listUsersSchema>;
export type AdjustBalanceInput = z.infer<typeof adjustBalanceSchema>;
export type SuspendUserInput = z.infer<typeof suspendUserSchema>;
