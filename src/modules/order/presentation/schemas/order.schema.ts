import { z } from 'zod';

export const createOrderSchema = z.object({
  service_id: z.string().uuid('Invalid service ID'),
  link: z
    .string()
    .url('Must be a valid URL')
    .max(2000),
  quantity: z
    .number()
    .int('Quantity must be a whole number')
    .positive('Quantity must be positive'),
});

export const listOrdersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(['PENDING', 'PROCESSING', 'IN_PROGRESS', 'COMPLETED', 'PARTIAL', 'CANCELED', 'REFUNDED', 'ERROR'])
    .optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ListOrdersInput = z.infer<typeof listOrdersSchema>;
