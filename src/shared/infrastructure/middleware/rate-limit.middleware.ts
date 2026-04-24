import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../redis';

// General API rate limit: 100 requests per minute per IP
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args) as never,
    prefix: '3f:rl:global:',
  }),
});

// Auth endpoints: 10 attempts per 15 minutes per IP
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, try again in 15 minutes' },
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args) as never,
    prefix: '3f:rl:auth:',
  }),
});

// Order placement: 30 orders per minute per IP
export const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Order rate limit exceeded, please slow down' },
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args) as never,
    prefix: '3f:rl:order:',
  }),
});
