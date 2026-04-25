import axios from 'axios';
import { config } from '../../../config';
import { logger } from '../../../shared/infrastructure/logger';

type ExchangeSource = 'live' | 'cache' | 'fallback';

interface CachedRate {
  rate: number;
  updatedAt: Date;
  expiresAt: number;
  source: Exclude<ExchangeSource, 'cache'>;
}

interface ExchangeRateResponse {
  base: 'USD';
  quote: 'VND';
  rate: string;
  source: ExchangeSource;
  updatedAt: string;
}

interface ExternalExchangeResponse {
  result?: string;
  rates?: Record<string, number>;
}

let cachedRate: CachedRate | null = null;

export class ExchangeRateService {
  async getUsdVndRate(): Promise<ExchangeRateResponse> {
    const now = Date.now();

    if (cachedRate && cachedRate.expiresAt > now) {
      return this.toResponse(cachedRate.rate, 'cache', cachedRate.updatedAt);
    }

    try {
      const { data } = await axios.get<ExternalExchangeResponse>(config.exchange.apiUrl, {
        timeout: 5000,
      });

      const rate = data.rates?.VND;
      if (!rate || !Number.isFinite(rate) || rate <= 0) {
        throw new Error('Exchange-rate response missing VND rate');
      }

      cachedRate = {
        rate,
        updatedAt: new Date(),
        expiresAt: now + config.exchange.cacheTtlMs,
        source: 'live',
      };

      return this.toResponse(rate, 'live', cachedRate.updatedAt);
    } catch (error) {
      logger.warn('Live exchange-rate fetch failed', {
        error: error instanceof Error ? error.message : error,
      });

      if (cachedRate) {
        return this.toResponse(cachedRate.rate, 'cache', cachedRate.updatedAt);
      }

      const fallbackRate = config.exchange.usdVndFallback;
      cachedRate = {
        rate: fallbackRate,
        updatedAt: new Date(),
        expiresAt: now + config.exchange.cacheTtlMs,
        source: 'fallback',
      };

      return this.toResponse(fallbackRate, 'fallback', cachedRate.updatedAt);
    }
  }

  private toResponse(rate: number, source: ExchangeSource, updatedAt: Date): ExchangeRateResponse {
    return {
      base: 'USD',
      quote: 'VND',
      rate: rate.toFixed(2),
      source,
      updatedAt: updatedAt.toISOString(),
    };
  }
}
