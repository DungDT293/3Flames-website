import { redis } from './redis';
import { config } from '../../config';
import { logger } from './logger';

// ─────────────────────────────────────────────────────────────
// CIRCUIT BREAKER
//
// Protects 3Flames from cascading failures when TheYTlab
// provider is down. Uses Redis for state so it works across
// all API server instances.
//
// State machine:
//   CLOSED  → provider healthy, requests flow normally
//   OPEN    → provider failing, orders blocked with 503
//
// Transition: CLOSED → OPEN when N failures occur within
// a sliding time window. Auto-recovers after cooldown TTL
// expires on the Redis flag.
//
// Redis keys:
//   3f:circuit:failures   — Sorted set of failure timestamps
//   3f:maintenance:orders — Flag key with TTL (exists = OPEN)
// ─────────────────────────────────────────────────────────────

const FAILURE_KEY = '3f:circuit:failures';
const MAINTENANCE_KEY = '3f:maintenance:orders';

export class CircuitBreaker {
  private readonly threshold: number;
  private readonly windowMs: number;
  private readonly cooldownMs: number;

  constructor() {
    this.threshold = config.circuitBreaker.failureThreshold;
    this.windowMs = config.circuitBreaker.failureWindowMs;
    this.cooldownMs = config.circuitBreaker.cooldownMs;
  }

  /**
   * Record a provider failure. If failures exceed threshold
   * within the time window, trip the breaker.
   */
  async recordFailure(): Promise<void> {
    const now = Date.now();

    // Add this failure to the sorted set (score = timestamp)
    await redis.zadd(FAILURE_KEY, now, `${now}`);

    // Prune entries older than the window
    const windowStart = now - this.windowMs;
    await redis.zremrangebyscore(FAILURE_KEY, '-inf', windowStart);

    // Count recent failures
    const failureCount = await redis.zcard(FAILURE_KEY);

    logger.warn('Provider failure recorded', {
      failureCount,
      threshold: this.threshold,
      windowMs: this.windowMs,
    });

    if (failureCount >= this.threshold) {
      await this.trip();
    }
  }

  /**
   * Record a successful provider call — resets the failure counter.
   */
  async recordSuccess(): Promise<void> {
    await redis.del(FAILURE_KEY);
  }

  /**
   * Trip the breaker — set the maintenance flag with TTL.
   */
  private async trip(): Promise<void> {
    const cooldownSeconds = Math.ceil(this.cooldownMs / 1000);
    await redis.set(MAINTENANCE_KEY, '1', 'EX', cooldownSeconds);

    // Clear failure set since breaker is now open
    await redis.del(FAILURE_KEY);

    logger.error('CIRCUIT BREAKER TRIPPED — Order intake paused', {
      cooldownMinutes: cooldownSeconds / 60,
    });
  }

  /**
   * Check if the breaker is currently open (maintenance mode active).
   */
  async isOpen(): Promise<boolean> {
    const flag = await redis.get(MAINTENANCE_KEY);
    return flag === '1';
  }

  /**
   * Manually reset the breaker (admin action).
   */
  async reset(): Promise<void> {
    await redis.del(MAINTENANCE_KEY);
    await redis.del(FAILURE_KEY);
    logger.info('Circuit breaker manually reset');
  }

  /**
   * Get current breaker status for admin dashboard.
   */
  async getStatus(): Promise<{
    isOpen: boolean;
    recentFailures: number;
    ttlSeconds: number;
  }> {
    const [flag, failureCount, ttl] = await Promise.all([
      redis.get(MAINTENANCE_KEY),
      redis.zcard(FAILURE_KEY),
      redis.ttl(MAINTENANCE_KEY),
    ]);

    return {
      isOpen: flag === '1',
      recentFailures: failureCount,
      ttlSeconds: ttl > 0 ? ttl : 0,
    };
  }
}
