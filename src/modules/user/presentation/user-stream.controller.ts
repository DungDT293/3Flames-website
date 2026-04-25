import { Router, Request, Response } from 'express';
import { subscribeToUserEvents } from '../../../shared/infrastructure/event-bus';
import { logger } from '../../../shared/infrastructure/logger';
import { redis } from '../../../shared/infrastructure/redis';

export const userStreamRouter = Router();

const MAX_SSE_CONNECTIONS_PER_USER = 3;

userStreamRouter.get('/stream', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const connKey = `3f:sse:users:${userId}`;

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

  const unsubscribe = subscribeToUserEvents(userId, (event) => {
    const eventName = event.type.toLowerCase();
    res.write(`event: ${eventName}\ndata: ${JSON.stringify(event)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    res.write(`:heartbeat ${Date.now()}\n\n`);
  }, 30_000);

  logger.info('User SSE client connected', { userId });

  req.on('close', async () => {
    clearInterval(heartbeat);
    unsubscribe();
    await redis.decr(connKey);
    logger.info('User SSE client disconnected', { userId });
  });
});
