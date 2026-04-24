import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Prisma, TransactionType } from '@prisma/client';
import { config } from '../../../config';
import { prisma } from '../../../shared/infrastructure/database';
import { logger } from '../../../shared/infrastructure/logger';
import { validate } from '../../../shared/infrastructure/middleware/validate.middleware';
import { BalanceService } from '../application/balance.service';
import { paymentWebhookSchema, PaymentWebhookPayload } from './schemas/webhook.schema';

const balanceService = new BalanceService();

export const webhookRouter = Router();

// ─────────────────────────────────────────────────────────────
// HMAC SIGNATURE VERIFICATION MIDDLEWARE
//
// The payment gateway signs the raw JSON body with HMAC-SHA256
// using our shared secret. We reconstruct the signature and
// compare with constant-time equality to prevent:
//   1. Spoofed deposit attacks (attacker crafts fake callbacks)
//   2. Timing attacks (leaking signature bytes via response time)
//
// Expected header: X-Signature: sha256=<hex digest>
// ─────────────────────────────────────────────────────────────
function verifyWebhookSignature(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const signatureHeader = req.headers['x-signature'] as string | undefined;

  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    logger.warn('Webhook received without valid signature header', {
      ip: req.ip,
    });
    res.status(401).json({ error: 'Missing or malformed X-Signature header' });
    return;
  }

  const receivedSignature = signatureHeader.slice(7); // strip "sha256="

  // Reconstruct HMAC from raw body
  const expectedSignature = crypto
    .createHmac('sha256', config.webhook.secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  const receivedBuffer = Buffer.from(receivedSignature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    logger.warn('Webhook signature verification failed', {
      ip: req.ip,
    });
    res.status(403).json({ error: 'Invalid signature' });
    return;
  }

  next();
}

// ─────────────────────────────────────────────────────────────
// POST /api/v1/webhooks/payment
//
// Receives callbacks from crypto payment gateways (Cryptomus,
// Coinbase Commerce, etc). Flow:
//   1. Verify HMAC-SHA256 signature (middleware above)
//   2. Validate payload structure (Zod)
//   3. Idempotency check (prevent double-credit from retries)
//   4. Credit user balance via BalanceService (FOR UPDATE lock)
//   5. Log DEPOSIT transaction
// ─────────────────────────────────────────────────────────────
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

    // Only process completed payments
    if (payload.event !== 'PAYMENT_COMPLETED') {
      res.json({ status: 'acknowledged', event: payload.event });
      return;
    }

    try {
      // Idempotency: check if this payment_id was already processed
      const existingTx = await prisma.transaction.findFirst({
        where: {
          description: { contains: payload.payment_id },
          type: TransactionType.DEPOSIT,
        },
      });

      if (existingTx) {
        logger.warn('Duplicate webhook payment, already processed', {
          paymentId: payload.payment_id,
          existingTransactionId: existingTx.id,
        });
        res.json({ status: 'already_processed', transactionId: existingTx.id });
        return;
      }

      // Verify user exists
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

      // Credit the user's balance (through BalanceService with FOR UPDATE lock)
      const amount = new Prisma.Decimal(payload.amount);
      const result = await balanceService.credit(
        payload.user_id,
        amount,
        TransactionType.DEPOSIT,
        `Deposit via payment gateway — Payment ID: ${payload.payment_id} — ${payload.amount} ${payload.currency}`,
      );

      logger.info('Webhook deposit processed successfully', {
        paymentId: payload.payment_id,
        userId: payload.user_id,
        amount: payload.amount,
        newBalance: result.newBalance.toString(),
        transactionId: result.transactionId,
      });

      res.json({
        status: 'processed',
        transactionId: result.transactionId,
        newBalance: result.newBalance.toString(),
      });
    } catch (error) {
      logger.error('Webhook payment processing failed', {
        paymentId: payload.payment_id,
        error,
      });
      next(error);
    }
  },
);
