import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';
import { InsufficientBalanceError } from '../../../modules/transaction/application/balance.service';
import { ServiceNotFoundError, InvalidQuantityError } from '../../../modules/order/application/order.service';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof InsufficientBalanceError) {
    res.status(402).json({
      error: 'Insufficient balance',
      balance: err.currentBalance.toString(),
      required: err.requestedAmount.toString(),
    });
    return;
  }

  if (err instanceof ServiceNotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }

  if (err instanceof InvalidQuantityError) {
    res.status(400).json({ error: err.message });
    return;
  }

  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
  });

  res.status(500).json({ error: 'Internal server error' });
}
