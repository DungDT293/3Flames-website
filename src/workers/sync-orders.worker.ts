// ─────────────────────────────────────────────────────────────
// SYNC ORDERS WORKER
// Runs every 5 minutes. Scans for active orders (Pending,
// Processing, In_Progress), batch-checks their status at the
// provider, updates local state, and auto-refunds for
// Canceled/Partial orders.
// ─────────────────────────────────────────────────────────────

import { Prisma, OrderStatus, TransactionType } from '@prisma/client';
import { prisma } from '../shared/infrastructure/database';
import { logger } from '../shared/infrastructure/logger';
import { TheYTlabApiClient } from '../modules/provider/infrastructure/theytlab-api.client';
import { BalanceService } from '../modules/transaction/application/balance.service';
import { publishOrderEvent } from '../shared/infrastructure/event-bus';

const provider = new TheYTlabApiClient();
const balanceService = new BalanceService();

const BATCH_SIZE = 100;

const PROVIDER_STATUS_MAP: Record<string, OrderStatus> = {
  Pending: OrderStatus.PENDING,
  Processing: OrderStatus.PROCESSING,
  'In progress': OrderStatus.IN_PROGRESS,
  Completed: OrderStatus.COMPLETED,
  Partial: OrderStatus.PARTIAL,
  Canceled: OrderStatus.CANCELED,
  Cancelled: OrderStatus.CANCELED,
};

export async function syncOrders(): Promise<void> {
  const startTime = Date.now();
  logger.info('Starting order sync...');

  // Fetch all active orders that need status checks
  const activeOrders = await prisma.order.findMany({
    where: {
      status: {
        in: [OrderStatus.PENDING, OrderStatus.PROCESSING, OrderStatus.IN_PROGRESS],
      },
      apiOrderId: { not: null },
    },
    select: {
      id: true,
      userId: true,
      apiOrderId: true,
      charge: true,
      quantity: true,
      status: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (activeOrders.length === 0) {
    logger.info('No active orders to sync');
    return;
  }

  logger.info(`Found ${activeOrders.length} active orders to sync`);

  let updated = 0;
  let refunded = 0;

  // Process in batches to avoid overwhelming the provider API
  for (let i = 0; i < activeOrders.length; i += BATCH_SIZE) {
    const batch = activeOrders.slice(i, i + BATCH_SIZE);
    const apiOrderIds = batch.map((o) => o.apiOrderId!);

    let statusMap;
    try {
      statusMap = await provider.checkMultiOrderStatus(apiOrderIds);
    } catch (error) {
      logger.error('Failed to fetch batch status from provider', {
        batchStart: i,
        batchSize: batch.length,
        error,
      });
      continue;
    }

    for (const order of batch) {
      const providerStatus = statusMap[order.apiOrderId!];
      if (!providerStatus) {
        logger.warn('No status returned for order', {
          orderId: order.id,
          apiOrderId: order.apiOrderId,
        });
        continue;
      }

      const newStatus = PROVIDER_STATUS_MAP[providerStatus.status];
      if (!newStatus) {
        logger.warn('Unknown provider status', {
          orderId: order.id,
          providerStatus: providerStatus.status,
        });
        continue;
      }

      // Skip if status hasn't changed
      if (newStatus === order.status) {
        continue;
      }

      try {
        // Update order status and provider-reported fields
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: newStatus,
            startCount: providerStatus.startCount
              ? parseInt(providerStatus.startCount, 10)
              : undefined,
            remains: providerStatus.remains
              ? parseInt(providerStatus.remains, 10)
              : undefined,
          },
        });
        updated++;

        // Publish real-time event via Redis pub/sub → SSE clients
        await publishOrderEvent(order.userId, {
          orderId: order.id,
          status: newStatus,
          remains: providerStatus.remains ? parseInt(providerStatus.remains, 10) : undefined,
          updatedAt: new Date().toISOString(),
        });

        // ── REFUND LOGIC ────────────────────────────────────
        if (newStatus === OrderStatus.CANCELED) {
          const alreadyRefunded = await prisma.transaction.findFirst({
            where: { orderId: order.id, type: TransactionType.REFUND },
            select: { id: true },
          });

          if (!alreadyRefunded) {
            await balanceService.credit(
              order.userId,
              order.charge,
              TransactionType.REFUND,
              `Auto-refund: order #${order.id.slice(0, 8)} canceled by provider`,
              order.id,
            );

            refunded++;
            logger.info('Full refund issued for canceled order', {
              orderId: order.id,
              userId: order.userId,
              amount: order.charge.toString(),
            });

            await publishOrderEvent(order.userId, {
              orderId: order.id,
              status: 'REFUNDED',
              charge: order.charge.toString(),
              refundAmount: order.charge.toString(),
              updatedAt: new Date().toISOString(),
            });
          }

          await prisma.order.update({
            where: { id: order.id },
            data: { status: OrderStatus.REFUNDED },
          });
        }

        if (newStatus === OrderStatus.PARTIAL) {
          const remains = providerStatus.remains
            ? parseInt(providerStatus.remains, 10)
            : 0;

          if (remains > 0) {
            const alreadyRefunded = await prisma.transaction.findFirst({
              where: { orderId: order.id, type: TransactionType.REFUND },
              select: { id: true },
            });

            if (!alreadyRefunded) {
              const perUnitCost = new Prisma.Decimal(order.charge.toString()).div(
                order.quantity,
              );
              const refundAmount = perUnitCost
                .mul(remains)
                .toDecimalPlaces(6);

              await balanceService.credit(
                order.userId,
                refundAmount,
                TransactionType.REFUND,
                `Auto-refund: partial delivery for order #${order.id.slice(0, 8)}, ${remains} units undelivered`,
                order.id,
              );

              refunded++;
              logger.info('Partial refund issued', {
                orderId: order.id,
                userId: order.userId,
                refundAmount: refundAmount.toString(),
                remains,
              });

              await publishOrderEvent(order.userId, {
                orderId: order.id,
                status: 'PARTIAL',
                remains,
                refundAmount: refundAmount.toString(),
                updatedAt: new Date().toISOString(),
              });
            }
          }
        }
      } catch (error) {
        logger.error('Failed to update order status', {
          orderId: order.id,
          newStatus,
          error,
        });
      }
    }
  }

  const elapsed = Date.now() - startTime;
  logger.info('Order sync completed', {
    totalActive: activeOrders.length,
    updated,
    refunded,
    durationMs: elapsed,
  });
}

// ── Entrypoint (only when run directly, not imported) ───────
if (require.main === module) {
  (async () => {
    logger.info('Sync Orders Worker started');
    await syncOrders();
    await prisma.$disconnect();
    process.exit(0);
  })().catch((err) => {
    logger.error('Sync Orders Worker crashed', { error: err });
    process.exit(1);
  });
}
