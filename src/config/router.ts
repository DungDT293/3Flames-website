import { Router } from 'express';
import { authMiddleware, adminOnly } from '../shared/infrastructure/middleware/auth.middleware';
import { globalLimiter } from '../shared/infrastructure/middleware/rate-limit.middleware';
import { authRouter } from '../modules/user/presentation/auth.controller';
import { userRouter } from '../modules/user/presentation/user.controller';
import { serviceRouter } from '../modules/service/presentation/service.controller';
import { orderRouter } from '../modules/order/presentation/order.controller';
import { orderStreamRouter } from '../modules/order/presentation/order-stream.controller';
import { adminRouter } from '../modules/user/presentation/admin.controller';
import { webhookRouter } from '../modules/transaction/presentation/webhook.controller';
import { uploadRouter } from '../shared/infrastructure/upload.controller';

export function createRouter(): Router {
  const router = Router();

  // Global rate limit applied to all /api/v1 routes
  router.use(globalLimiter);

  // ── Public routes ─────────────────────────────────────
  router.use('/auth', authRouter);
  router.use('/services', serviceRouter);

  // ── Webhook routes (signature-verified, no JWT) ───────
  router.use('/webhooks', webhookRouter);

  // ── Protected routes (JWT or API key required) ────────
  router.use('/users', authMiddleware, userRouter);
  router.use('/orders', authMiddleware, orderRouter);
  router.use('/orders', authMiddleware, orderStreamRouter);
  router.use('/upload', authMiddleware, uploadRouter);

  // ── Admin routes (JWT + ADMIN role required) ──────────
  router.use('/admin', authMiddleware, adminOnly, adminRouter);

  return router;
}
