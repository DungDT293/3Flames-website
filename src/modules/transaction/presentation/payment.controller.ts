import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../../../config';
import { prisma } from '../../../shared/infrastructure/database';
import { logger } from '../../../shared/infrastructure/logger';
import { validate } from '../../../shared/infrastructure/middleware/validate.middleware';
import { createQrSchema, CreateQrPayload } from './schemas/payment.schema';

export const paymentRouter = Router();

const DEPOSIT_EXPIRY_MINUTES = 5;

paymentRouter.post(
  '/create-qr',
  validate(createQrSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    const { amount } = req.body as CreateQrPayload;
    const userId = req.user!.id;

    try {
      const userIdShort = userId.replace(/-/g, '').slice(0, 6).toUpperCase();
      const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
      const memo = `3FDEP${userIdShort}${randomHex}`;

      const expiresAt = new Date(Date.now() + DEPOSIT_EXPIRY_MINUTES * 60 * 1000);

      const depositRequest = await prisma.depositRequest.create({
        data: {
          userId,
          memo,
          amountVnd: amount,
          status: 'PENDING',
          expiresAt,
        },
      });

      const { bankBin, accountNumber, accountName } = config.vietqr;
      const qrUrl = `https://img.vietqr.io/image/${bankBin}-${accountNumber}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(accountName)}`;

      logger.info('Payment QR generated', {
        userId,
        amount,
        memo,
        depositRequestId: depositRequest.id,
        expiresAt: expiresAt.toISOString(),
      });

      res.status(201).json({
        qrUrl,
        memo,
        amount,
        depositRequestId: depositRequest.id,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      logger.error('Failed to generate payment QR', { userId, amount, error });
      next(error);
    }
  },
);
