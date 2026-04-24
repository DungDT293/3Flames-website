import { Router, Request, Response } from 'express';
import { subscribeToUserOrders } from '../../../shared/infrastructure/event-bus';
import { logger } from '../../../shared/infrastructure/logger';

export const orderStreamRouter = Router();

// ─────────────────────────────────────────────────────────────
// GET /api/v1/orders/stream
//
// Server-Sent Events endpoint. The frontend connects once and
// receives real-time order status updates, eliminating the need
// for aggressive polling.
//
// Protocol:
//   - Client opens: EventSource('/api/v1/orders/stream', { headers })
//   - Server sends: event: order_update\ndata: {json}\n\n
//   - Heartbeat every 30s to keep connection alive past proxies
//   - Client disconnects: unsubscribe from Redis channel
//
// SSE was chosen over WebSocket because:
//   1. Uni-directional (server→client) is all we need here
//   2. Auto-reconnect built into EventSource API
//   3. Works through HTTP/2 without upgrade negotiation
//   4. Simpler to load-balance (standard HTTP)
// ─────────────────────────────────────────────────────────────
orderStreamRouter.get('/stream', (req: Request, res: Response) => {
  const userId = req.user!.id;

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable nginx buffering
  });

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ userId, timestamp: new Date().toISOString() })}\n\n`);

  // Subscribe to this user's order events via Redis pub/sub
  const unsubscribe = subscribeToUserOrders(userId, (event) => {
    res.write(`event: order_update\ndata: ${JSON.stringify(event)}\n\n`);
  });

  // Heartbeat every 30s — keeps connection alive past reverse proxies
  // and lets the client detect dead connections faster
  const heartbeat = setInterval(() => {
    res.write(`:heartbeat ${Date.now()}\n\n`);
  }, 30_000);

  logger.info('SSE client connected', { userId });

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    logger.info('SSE client disconnected', { userId });
  });
});
