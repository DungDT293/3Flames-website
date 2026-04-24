// ─────────────────────────────────────────────────────────────
// SYNC SERVICES WORKER
// Runs every 24 hours. Fetches the full service catalog from
// TheYTlab, upserts into local DB, and recalculates selling
// prices when provider costs change.
// ─────────────────────────────────────────────────────────────

import { Prisma } from '@prisma/client';
import { prisma } from '../shared/infrastructure/database';
import { logger } from '../shared/infrastructure/logger';
import { config } from '../config';
import { TheYTlabApiClient } from '../modules/provider/infrastructure/theytlab-api.client';
import { ProviderService } from '../modules/provider/domain/provider-api.interface';

const provider = new TheYTlabApiClient();

function calculateSellingPrice(
  originalPrice: Prisma.Decimal,
  marginPercent: number,
): Prisma.Decimal {
  const margin = new Prisma.Decimal(marginPercent).div(100).plus(1);
  return originalPrice.mul(margin).toDecimalPlaces(6);
}

function mapServiceType(type: string): 'DEFAULT' | 'SUBSCRIPTION' | 'CUSTOM_COMMENTS' | 'PACKAGE' {
  const typeMap: Record<string, 'DEFAULT' | 'SUBSCRIPTION' | 'CUSTOM_COMMENTS' | 'PACKAGE'> = {
    Default: 'DEFAULT',
    Subscription: 'SUBSCRIPTION',
    'Custom Comments': 'CUSTOM_COMMENTS',
    Package: 'PACKAGE',
  };
  return typeMap[type] || 'DEFAULT';
}

async function syncServices(): Promise<void> {
  const startTime = Date.now();
  logger.info('Starting service sync...');

  let services: ProviderService[];
  try {
    services = await provider.getServices();
  } catch (error) {
    // SILENT FAILURE: Log but do NOT crash the worker or queue.
    // Existing services in DB are preserved as-is until next successful sync.
    logger.warn('Service sync skipped — provider unreachable, existing catalog preserved', {
      error: error instanceof Error ? error.message : error,
    });
    return;
  }

  logger.info(`Fetched ${services.length} services from provider`);

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  const margin = config.pricing.defaultProfitMargin;

  for (const svc of services) {
    const originalPrice = new Prisma.Decimal(svc.rate);
    const sellingPrice = calculateSellingPrice(originalPrice, margin);

    try {
      const existing = await prisma.service.findUnique({
        where: { providerServiceId: svc.serviceId },
      });

      if (!existing) {
        // New service — insert
        await prisma.service.create({
          data: {
            providerServiceId: svc.serviceId,
            name: svc.name,
            category: svc.category,
            description: svc.description || null,
            originalPrice,
            sellingPrice,
            profitMargin: margin,
            minQuantity: parseInt(svc.min, 10),
            maxQuantity: parseInt(svc.max, 10),
            type: mapServiceType(svc.type),
            isActive: true,
          },
        });
        created++;
      } else {
        // Existing service — check if provider price changed
        const priceChanged = !existing.originalPrice.equals(originalPrice);
        const detailsChanged =
          existing.name !== svc.name ||
          existing.category !== svc.category ||
          existing.minQuantity !== parseInt(svc.min, 10) ||
          existing.maxQuantity !== parseInt(svc.max, 10);

        if (priceChanged || detailsChanged) {
          const updateData: Prisma.ServiceUpdateInput = {
            name: svc.name,
            category: svc.category,
            description: svc.description || null,
            minQuantity: parseInt(svc.min, 10),
            maxQuantity: parseInt(svc.max, 10),
          };

          if (priceChanged) {
            // CRITICAL: Recalculate selling price to maintain profit margin
            updateData.originalPrice = originalPrice;
            updateData.sellingPrice = calculateSellingPrice(originalPrice, margin);
            updateData.profitMargin = margin;

            logger.warn('Service price changed at provider', {
              serviceId: svc.serviceId,
              name: svc.name,
              oldPrice: existing.originalPrice.toString(),
              newPrice: originalPrice.toString(),
              newSellingPrice: updateData.sellingPrice.toString(),
            });
          }

          await prisma.service.update({
            where: { providerServiceId: svc.serviceId },
            data: updateData,
          });
          updated++;
        } else {
          unchanged++;
        }
      }
    } catch (error) {
      logger.error('Failed to upsert service', {
        providerServiceId: svc.serviceId,
        error,
      });
    }
  }

  const elapsed = Date.now() - startTime;
  logger.info('Service sync completed', {
    created,
    updated,
    unchanged,
    total: services.length,
    durationMs: elapsed,
  });
}

// ── Entrypoint ──────────────────────────────────────────────
async function main() {
  logger.info('Sync Services Worker started');
  await syncServices();
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  logger.error('Sync Services Worker crashed', { error: err });
  process.exit(1);
});
