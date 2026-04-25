import Redis from 'ioredis';
import { config } from '../../config';
import { logger } from './logger';

export interface OrderStatusEvent {
  orderId: string;
  status: string;
  remains?: number;
  charge?: string;
  refundAmount?: string;
  updatedAt: string;
}

export interface UserEvent {
  type: 'DEPOSIT_SUCCESS';
  amount: string;
  newBalance: string;
  transactionId: string;
  timestamp: string;
}

const CHANNEL_PREFIX = 'order:status:';
const USER_CHANNEL_PREFIX = 'user:events:';

// ─────────────────────────────────────────────────────────────
// GLOBAL DISPATCHER
//
// Single Redis message listener that routes to per-channel
// callback sets. Prevents listener leak: each subscribe/
// unsubscribe only modifies the Map, never adds/removes
// Redis event listeners.
// ─────────────────────────────────────────────────────────────

type AnyCallback = (message: string) => void;
const channelListeners = new Map<string, Set<AnyCallback>>();
let subscriber: Redis | null = null;
let dispatcherAttached = false;

function getSubscriber(): Redis {
  if (!subscriber) {
    subscriber = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      tls: config.redis.tls ? {} : undefined,
      maxRetriesPerRequest: null,
      lazyConnect: false,
    });
  }

  if (!dispatcherAttached) {
    subscriber.on('message', (channel: string, message: string) => {
      const callbacks = channelListeners.get(channel);
      if (callbacks) {
        for (const cb of callbacks) {
          try {
            cb(message);
          } catch (err) {
            logger.error('Event callback error', { channel, error: err });
          }
        }
      }
    });
    dispatcherAttached = true;
  }

  return subscriber;
}

function addChannelListener(channel: string, cb: AnyCallback): void {
  const sub = getSubscriber();
  let set = channelListeners.get(channel);
  const isNew = !set || set.size === 0;

  if (!set) {
    set = new Set();
    channelListeners.set(channel, set);
  }
  set.add(cb);

  if (isNew) {
    sub.subscribe(channel).catch((err) => {
      logger.error('Failed to subscribe to channel', { channel, error: err });
    });
  }
}

function removeChannelListener(channel: string, cb: AnyCallback): void {
  const set = channelListeners.get(channel);
  if (!set) return;

  set.delete(cb);

  if (set.size === 0) {
    channelListeners.delete(channel);
    const sub = getSubscriber();
    sub.unsubscribe(channel).catch((err) => {
      logger.error('Failed to unsubscribe from channel', { channel, error: err });
    });
  }
}

// ─────────────────────────────────────────────────────────────
// ORDER EVENTS — channel: order:status:<userId>
// ─────────────────────────────────────────────────────────────

export async function publishOrderEvent(
  userId: string,
  event: OrderStatusEvent,
): Promise<void> {
  const { redis } = await import('./redis');
  const channel = `${CHANNEL_PREFIX}${userId}`;
  await redis.publish(channel, JSON.stringify(event));
}

type EventCallback = (event: OrderStatusEvent) => void;

export function subscribeToUserOrders(
  userId: string,
  callback: EventCallback,
): () => void {
  const channel = `${CHANNEL_PREFIX}${userId}`;

  const handler: AnyCallback = (message) => {
    try {
      const event = JSON.parse(message) as OrderStatusEvent;
      callback(event);
    } catch (err) {
      logger.error('Failed to parse order event', { message, error: err });
    }
  };

  addChannelListener(channel, handler);

  return () => {
    removeChannelListener(channel, handler);
  };
}

// ─────────────────────────────────────────────────────────────
// USER EVENTS — channel: user:events:<userId>
// ─────────────────────────────────────────────────────────────

export async function publishUserEvent(
  userId: string,
  event: UserEvent,
): Promise<void> {
  const { redis } = await import('./redis');
  const channel = `${USER_CHANNEL_PREFIX}${userId}`;
  await redis.publish(channel, JSON.stringify(event));
}

type UserEventCallback = (event: UserEvent) => void;

export function subscribeToUserEvents(
  userId: string,
  callback: UserEventCallback,
): () => void {
  const channel = `${USER_CHANNEL_PREFIX}${userId}`;

  const handler: AnyCallback = (message) => {
    try {
      const event = JSON.parse(message) as UserEvent;
      callback(event);
    } catch (err) {
      logger.error('Failed to parse user event', { message, error: err });
    }
  };

  addChannelListener(channel, handler);

  return () => {
    removeChannelListener(channel, handler);
  };
}
