import { Router, Request, Response, NextFunction } from 'express';
import { ExchangeRateService } from '../application/exchange-rate.service';

const exchangeRateService = new ExchangeRateService();

export const exchangeRateRouter = Router();

exchangeRateRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rate = await exchangeRateService.getUsdVndRate();
    res.json(rate);
  } catch (error) {
    next(error);
  }
});
