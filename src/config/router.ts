import { Router } from 'express';
import { authMiddleware, adminOnly } from '../shared/infrastructure/middleware/auth.middleware';
import { globalLimiter } from '../shared/infrastructure/middleware/rate-limit.middleware';
import { authRouter } from '../modules/user/presentation/auth.controller';
import { userRouter } from '../modules/user/presentation/user.controller';
import { userStreamRouter } from '../modules/user/presentation/user-stream.controller';
import { serviceRouter } from '../modules/service/presentation/service.controller';
import { orderRouter } from '../modules/order/presentation/order.controller';
import { orderStreamRouter } from '../modules/order/presentation/order-stream.controller';
import { adminRouter } from '../modules/user/presentation/admin.controller';
import { webhookRouter } from '../modules/transaction/presentation/webhook.controller';
import { paymentRouter } from '../modules/transaction/presentation/payment.controller';
import { uploadRouter } from '../shared/infrastructure/upload.controller';
import { exchangeRateRouter } from '../modules/exchange/presentation/exchange-rate.controller';

export function createRouter(): Router {
  const router = Router();

  // Global rate limit applied to all /api/v1 routes
  router.use(globalLimiter);

  // ── Public routes ─────────────────────────────────────
  router.use('/auth', authRouter);
  router.use('/services', serviceRouter);
  router.use('/exchange-rate', exchangeRateRouter);

  // ── Webhook routes (signature-verified, no JWT) ───────
  router.use('/webhooks', webhookRouter);

  // ── Protected routes (JWT required) ────────
  router.use('/users', authMiddleware, userRouter);
  router.use('/users', authMiddleware, userStreamRouter);
  // Stream routes MUST be mounted before order routes (/:id would catch "stream")
  router.use('/orders', authMiddleware, orderStreamRouter);
  router.use('/orders', authMiddleware, orderRouter);
  router.use('/payments', authMiddleware, paymentRouter);
  router.use('/upload', authMiddleware, uploadRouter);

  // ── Staff routes (JWT + SUPER_ADMIN/ADMIN/SUPPORT role required) ──────────
  router.use('/admin', authMiddleware, adminOnly, adminRouter);

  return router;
}
