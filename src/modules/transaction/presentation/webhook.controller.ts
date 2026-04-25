import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Prisma, TransactionType } from '@prisma/client';
import { config } from '../../../config';
import { prisma } from '../../../shared/infrastructure/database';
import { redis } from '../../../shared/infrastructure/redis';
import { logger } from '../../../shared/infrastructure/logger';
import { validate } from '../../../shared/infrastructure/middleware/validate.middleware';
import { BalanceService } from '../application/balance.service';
import { publishUserEvent } from '../../../shared/infrastructure/event-bus';
import { paymentWebhookSchema, PaymentWebhookPayload } from './schemas/webhook.schema';

const balanceService = new BalanceService();

export const webhookRouter = Router();

function verifyWebhookSignature(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const signatureHeader = req.headers['x-signature'] as string | undefined;

  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    logger.warn('Webhook received without valid signature header', { ip: req.ip });
    res.status(401).json({ error: 'Missing or malformed X-Signature header' });
    return;
  }

  const receivedSignature = signatureHeader.slice(7);
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    res.status(500).json({ error: 'Raw body not available for signature verification' });
    return;
  }

  const expectedSignature = crypto
    .createHmac('sha256', config.webhook.secret)
    .update(rawBody)
    .digest('hex');

  const receivedBuffer = Buffer.from(receivedSignature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    logger.warn('Webhook signature verification failed', { ip: req.ip });
    res.status(403).json({ error: 'Invalid signature' });
    return;
  }

  next();
}

webhookRouter.post(
  '/payment',
  verifyWebhookSignature,
  validate(paymentWebhookSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    const payload = req.body as PaymentWebhookPayload;

    logger.info('Webhook received', {
      event: payload.event,
      paymentId: payload.payment_id,
      userId: payload.user_id,
      amount: payload.amount,
    });

    if (payload.event !== 'PAYMENT_COMPLETED') {
      res.json({ status: 'acknowledged', event: payload.event });
      return;
    }

    // Distributed lock — prevents concurrent webhooks with same payment_id from racing
    const lockKey = `3f:webhook:lock:${payload.payment_id}`;
    const lockToken = crypto.randomBytes(16).toString('hex');
    const acquired = await redis.set(lockKey, lockToken, 'EX', 60, 'NX');

    if (!acquired) {
      logger.warn('Webhook concurrent request blocked by lock', { paymentId: payload.payment_id });
      res.status(409).json({ status: 'processing', message: 'Payment is currently being processed' });
      return;
    }

    try {
      // Idempotency check inside the lock — safe from race conditions now
      const existingDeposit = await prisma.depositRequest.findUnique({
        where: { providerPaymentId: payload.payment_id },
      });

      if (existingDeposit?.status === 'CONFIRMED') {
        logger.warn('Duplicate webhook payment, already processed', {
          paymentId: payload.payment_id,
          depositRequestId: existingDeposit.id,
        });
        res.json({ status: 'already_processed', depositRequestId: existingDeposit.id });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: payload.user_id },
        select: { id: true, status: true },
      });

      if (!user) {
        logger.error('Webhook payment for non-existent user', {
          paymentId: payload.payment_id,
          userId: payload.user_id,
        });
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (user.status !== 'ACTIVE') {
        logger.warn('Webhook payment rejected — user not active', {
          paymentId: payload.payment_id,
          userId: payload.user_id,
          status: user.status,
        });
        res.status(403).json({ error: 'User account is not active' });
        return;
      }

      const amount = new Prisma.Decimal(payload.amount);
      const result = await balanceService.credit(
        payload.user_id,
        amount,
        TransactionType.DEPOSIT,
        `Deposit via payment gateway — Payment ID: ${payload.payment_id} — ${payload.amount} ${payload.currency}`,
      );

      await prisma.depositRequest.updateMany({
        where: { userId: payload.user_id, status: 'PENDING', providerPaymentId: null },
        data: {
          providerPaymentId: payload.payment_id,
          status: 'CONFIRMED',
          transactionId: result.transactionId,
        },
      });

      logger.info('Webhook deposit processed successfully', {
        paymentId: payload.payment_id,
        userId: payload.user_id,
        amount: payload.amount,
        newBalance: result.newBalance.toString(),
        transactionId: result.transactionId,
      });

      await publishUserEvent(payload.user_id, {
        type: 'DEPOSIT_SUCCESS',
        amount: amount.toString(),
        newBalance: result.newBalance.toString(),
        transactionId: result.transactionId,
        timestamp: new Date().toISOString(),
      });

      res.json({
        status: 'processed',
        transactionId: result.transactionId,
        newBalance: result.newBalance.toString(),
      });
    } catch (error) {
      logger.error('Webhook payment processing failed', { paymentId: payload.payment_id, error });
      next(error);
    } finally {
      // Release lock only if we still own it
      const current = await redis.get(lockKey);
      if (current === lockToken) await redis.del(lockKey);
    }
  },
);
