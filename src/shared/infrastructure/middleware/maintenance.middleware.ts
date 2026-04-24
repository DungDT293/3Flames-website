import { Request, Response, NextFunction } from 'express';
import { CircuitBreaker } from '../circuit-breaker';

const circuitBreaker = new CircuitBreaker();

// ─────────────────────────────────────────────────────────────
// MAINTENANCE MIDDLEWARE
//
// Applied ONLY to POST /api/v1/orders. When the circuit breaker
// has tripped (provider down), intercepts with a professional,
// white-labeled 503 that completely hides the upstream failure.
//
// The client sees a 3Flames-branded message about "algorithm
// synchronization" — no mention of providers, APIs, or errors.
// ─────────────────────────────────────────────────────────────
export async function maintenanceGuard(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const isDown = await circuitBreaker.isOpen();

  if (isDown) {
    res.status(503).json({
      error: 'Service temporarily unavailable',
      message:
        'The 3Flames processing core is temporarily pausing order intake to synchronize ' +
        'with the latest social media algorithm updates. This ensures the safety of your ' +
        'accounts. Please try again in 30 minutes.',
      retry_after_seconds: 1800,
    });
    return;
  }

  next();
}
