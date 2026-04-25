import { Router, Request, Response } from 'express';
import { subscribeToUserOrders } from '../../../shared/infrastructure/event-bus';
import { logger } from '../../../shared/infrastructure/logger';
import { redis } from '../../../shared/infrastructure/redis';

export const orderStreamRouter = Router();

const MAX_SSE_CONNECTIONS_PER_USER = 3;

orderStreamRouter.get('/stream', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const connKey = `3f:sse:orders:${userId}`;

  const count = await redis.incr(connKey);
  await redis.expire(connKey, 300);

  if (count > MAX_SSE_CONNECTIONS_PER_USER) {
    await redis.decr(connKey);
    res.status(429).json({ error: 'Too many active SSE connections' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(`event: connected\ndata: ${JSON.stringify({ userId, timestamp: new Date().toISOString() })}\n\n`);

  const unsubscribe = subscribeToUserOrders(userId, (event) => {
    res.write(`event: order_update\ndata: ${JSON.stringify(event)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    res.write(`:heartbeat ${Date.now()}\n\n`);
  }, 30_000);

  logger.info('SSE client connected', { userId });

  req.on('close', async () => {
    clearInterval(heartbeat);
    unsubscribe();
    await redis.decr(connKey);
    logger.info('SSE client disconnected', { userId });
  });
});
