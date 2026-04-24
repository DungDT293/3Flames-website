import { z } from 'zod';

export const registerSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .max(255)
    .transform((v) => v.toLowerCase().trim()),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128),
  accept_tos: z
    .boolean()
    .refine((v) => v === true, {
      message: 'You must accept the Terms of Service to register',
    }),
});

export const loginSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, 'Password is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
