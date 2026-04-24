import Redis from 'ioredis';
import { config } from '../../config';
import { logger } from './logger';

// ─────────────────────────────────────────────────────────────
// ORDER EVENT BUS
//
// Uses Redis Pub/Sub to broadcast order status changes across
// all API server instances. The sync-orders worker publishes
// events, and SSE connections subscribe per-user.
//
// Channel pattern: order:status:<userId>
// Payload: JSON { orderId, status, remains?, updatedAt }
// ─────────────────────────────────────────────────────────────

export interface OrderStatusEvent {
  orderId: string;
  status: string;
  remains?: number;
  charge?: string;
  refundAmount?: string;
  updatedAt: string;
}

const CHANNEL_PREFIX = 'order:status:';

// Dedicated subscriber connection (Redis requires separate connections
// for subscribe mode vs command mode)
let subscriber: Redis | null = null;

function getSubscriber(): Redis {
  if (!subscriber) {
    subscriber = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      maxRetriesPerRequest: null,
      lazyConnect: false,
    });
  }
  return subscriber;
}

// Publisher uses the shared redis connection
export async function publishOrderEvent(
  userId: string,
  event: OrderStatusEvent,
): Promise<void> {
  // Dynamic import to avoid circular deps — redis.ts is a peer
  const { redis } = await import('./redis');
  const channel = `${CHANNEL_PREFIX}${userId}`;
  await redis.publish(channel, JSON.stringify(event));
}

type EventCallback = (event: OrderStatusEvent) => void;

export function subscribeToUserOrders(
  userId: string,
  callback: EventCallback,
): () => void {
  const sub = getSubscriber();
  const channel = `${CHANNEL_PREFIX}${userId}`;

  const handler = (_ch: string, message: string) => {
    try {
      const event = JSON.parse(message) as OrderStatusEvent;
      callback(event);
    } catch (err) {
      logger.error('Failed to parse order event', { message, error: err });
    }
  };

  sub.subscribe(channel).catch((err) => {
    logger.error('Failed to subscribe to order events', { userId, error: err });
  });

  sub.on('message', (ch, message) => {
    if (ch === channel) {
      handler(ch, message);
    }
  });

  // Return unsubscribe function
  return () => {
    sub.unsubscribe(channel).catch((err) => {
      logger.error('Failed to unsubscribe from order events', { userId, error: err });
    });
  };
}
