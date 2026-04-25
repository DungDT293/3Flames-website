import { Router, Request, Response } from 'express';
import { subscribeToUserEvents } from '../../../shared/infrastructure/event-bus';
import { logger } from '../../../shared/infrastructure/logger';

export const userStreamRouter = Router();

// ─────────────────────────────────────────────────────────────
// GET /api/v1/users/stream
//
// Server-Sent Events endpoint for user-level events (deposits,
// account changes, etc.). Parallel to the order stream but on
// a dedicated Redis channel to avoid coupling.
//
// Protocol:
//   - Client opens: new EventSource('/api/v1/users/stream')
//   - Server sends: event: deposit_success\ndata: {json}\n\n
//   - Heartbeat every 30s to keep connection alive
//   - Client disconnects: unsubscribe from Redis channel
// ─────────────────────────────────────────────────────────────
userStreamRouter.get('/stream', (req: Request, res: Response) => {
  const userId = req.user!.id;

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

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    logger.info('User SSE client disconnected', { userId });
  });
});
