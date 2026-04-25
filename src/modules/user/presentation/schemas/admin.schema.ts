import { z } from 'zod';

export const listUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(255).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED']).optional(),
  role: z.enum(['USER', 'SUPPORT', 'ADMIN', 'SUPER_ADMIN']).optional(),
});

export const adjustBalanceSchema = z.object({
  amount: z.coerce.number().positive('Amount must be positive'),
  type: z.enum(['ADD', 'DEDUCT']),
  description: z.string().trim().min(1, 'Description is required').max(500),
});

export const suspendUserSchema = z.object({
  reason: z.string().min(1, 'Reason is required').max(500),
});

export const updateUserRoleSchema = z.object({
  role: z.enum(['USER', 'SUPPORT', 'ADMIN', 'SUPER_ADMIN']),
});

export const listDepositRequestsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'CONFIRMED', 'EXPIRED', 'FAILED']).optional(),
  search: z.string().max(255).optional(),
});

export const confirmDepositSchema = z.object({
  providerPaymentId: z.string().trim().max(200).optional(),
  note: z.string().trim().max(500).optional(),
});

export const rejectDepositSchema = z.object({
  reason: z.string().trim().min(1, 'Reason is required').max(500),
});

export const listAuditLogsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  actorRole: z.enum(['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'USER', 'SYSTEM']).optional(),
});

export const adminAnalyticsSchema = z.object({
  period: z.enum(['day', 'month']).default('day'),
});

export const listPricingServicesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(255).optional(),
  category: z.string().max(255).optional(),
  overrideOnly: z.coerce.boolean().optional(),
  active: z.coerce.boolean().optional(),
});

export const updateMarginSchema = z.object({
  margin: z.coerce.number().min(0).max(1000),
});

export type ListUsersInput = z.infer<typeof listUsersSchema>;
export type AdjustBalanceInput = z.infer<typeof adjustBalanceSchema>;
export type SuspendUserInput = z.infer<typeof suspendUserSchema>;
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;
export type ListDepositRequestsInput = z.infer<typeof listDepositRequestsSchema>;
export type ConfirmDepositInput = z.infer<typeof confirmDepositSchema>;
export type RejectDepositInput = z.infer<typeof rejectDepositSchema>;
export type ListAuditLogsInput = z.infer<typeof listAuditLogsSchema>;
export type AdminAnalyticsInput = z.infer<typeof adminAnalyticsSchema>;
export type ListPricingServicesInput = z.infer<typeof listPricingServicesSchema>;
export type UpdateMarginInput = z.infer<typeof updateMarginSchema>;
