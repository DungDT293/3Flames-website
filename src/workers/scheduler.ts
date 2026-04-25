// ─────────────────────────────────────────────────────────────
// SCHEDULER
// Uses BullMQ repeatable jobs to trigger sync workers.
// Run this as a long-lived process alongside the API server.
// ─────────────────────────────────────────────────────────────

import { Queue, Worker } from 'bullmq';
import { config } from '../config';
import { logger } from '../shared/infrastructure/logger';

const connection = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  tls: config.redis.tls ? {} : undefined,
};

async function startScheduler() {
  // ── Sync Services Queue (every 24 hours) ──────────────
  const servicesQueue = new Queue('sync-services', { connection });

  await servicesQueue.upsertJobScheduler(
    'sync-services-daily',
    { pattern: '0 3 * * *' }, // 3 AM daily
    { name: 'sync-services', data: {} },
  );

  const servicesWorker = new Worker(
    'sync-services',
    async () => {
      logger.info('Triggering service sync via scheduler');
      const { syncServices } = await import('./sync-services.worker');
      await syncServices();
    },
    { connection, concurrency: 1 },
  );

  // ── Sync Orders Queue (every 5 minutes) ───────────────
  const ordersQueue = new Queue('sync-orders', { connection });

  await ordersQueue.upsertJobScheduler(
    'sync-orders-interval',
    { every: 5 * 60 * 1000 }, // 5 minutes
    { name: 'sync-orders', data: {} },
  );

  const ordersWorker = new Worker(
    'sync-orders',
    async () => {
      logger.info('Triggering order sync via scheduler');
      const { syncOrders } = await import('./sync-orders.worker');
      await syncOrders();
    },
    { connection, concurrency: 1 },
  );

  // ── Expire Deposits Queue (every 15 minutes) ──────────
  const depositsQueue = new Queue('expire-deposits', { connection });

  await depositsQueue.upsertJobScheduler(
    'expire-deposits-interval',
    { every: 15 * 60 * 1000 }, // 15 minutes
    { name: 'expire-deposits', data: {} },
  );

  const depositsWorker = new Worker(
    'expire-deposits',
    async () => {
      logger.info('Triggering deposit expiry via scheduler');
      const { expireDeposits } = await import('./expire-deposits.worker');
      await expireDeposits();
    },
    { connection, concurrency: 1 },
  );

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Scheduler shutting down...');
    await servicesWorker.close();
    await ordersWorker.close();
    await depositsWorker.close();
    await servicesQueue.close();
    await ordersQueue.close();
    await depositsQueue.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  logger.info('Scheduler started — sync-services (daily 3AM), sync-orders (every 5min), expire-deposits (every 15min)');
}

startScheduler().catch((err) => {
  logger.error('Scheduler failed to start', { error: err });
  process.exit(1);
});
