import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { createRouter } from './config/router';
import { errorHandler } from './shared/infrastructure/middleware/error.middleware';
import { redis } from './shared/infrastructure/redis';
import { logger } from './shared/infrastructure/logger';

async function bootstrap() {
  // Ensure Redis is connected (may already be connected via rate-limiter import)
  if (redis.status === 'wait') {
    await redis.connect();
  }
  logger.info('Redis connected');

  const allowedOrigin = process.env.FRONTEND_ORIGIN;
  if (!allowedOrigin && config.env === 'production') {
    throw new Error('Missing required environment variable: FRONTEND_ORIGIN');
  }

  const app = express();

  // ── Global middleware ──────────────────────────────────
  app.use(helmet());
  app.use(cors({
    origin: allowedOrigin || 'http://localhost:3001',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // Trust first proxy for correct req.ip behind reverse proxy/CDN
  app.set('trust proxy', 1);

  // Capture raw body for webhook HMAC verification
  app.use(express.json({
    limit: '1mb',
    verify: (req: express.Request, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }));

  // ── Health check (no auth, no rate limit) ──────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: '3flames-api', timestamp: new Date().toISOString() });
  });

  // ── API v1 routes ──────────────────────────────────────
  app.use('/api/v1', createRouter());

  // ── Global error handler (must be last) ────────────────
  app.use(errorHandler);

  // ── Start server ───────────────────────────────────────
  app.listen(config.port, () => {
    logger.info(`3Flames API running on port ${config.port} [${config.env}]`);
  });

  // ── Graceful shutdown ──────────────────────────────────
  const shutdown = async () => {
    logger.info('Shutting down...');
    await redis.quit();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch((err) => {
  console.error('STARTUP ERROR:', err);
  logger.error('Failed to start server', { error: err });
  process.exit(1);
});
