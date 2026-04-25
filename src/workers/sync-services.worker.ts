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

const PRICING_MARGIN_KEY = 'pricing.defaultProfitMargin';

function calculateSellingPrice(
  originalPrice: Prisma.Decimal,
  marginPercent: Prisma.Decimal.Value,
): Prisma.Decimal {
  const margin = new Prisma.Decimal(marginPercent).div(100).plus(1);
  return originalPrice.mul(margin).toDecimalPlaces(6);
}

async function getDefaultProfitMargin(): Promise<Prisma.Decimal> {
  const setting = await prisma.adminSetting.findUnique({ where: { key: PRICING_MARGIN_KEY } });
  const raw = setting?.value;
  if (typeof raw === 'number' || typeof raw === 'string') return new Prisma.Decimal(raw);
  if (raw && typeof raw === 'object' && 'margin' in raw) {
    return new Prisma.Decimal((raw as { margin: number | string }).margin);
  }
  return new Prisma.Decimal(config.pricing.defaultProfitMargin);
}

const ALLOWED_CATEGORY_KEYWORDS = ['youtube', 'facebook'];

function isAllowedCategory(category: string): boolean {
  const lower = category.toLowerCase();
  return ALLOWED_CATEGORY_KEYWORDS.some((kw) => lower.includes(kw));
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

export async function syncServices(): Promise<void> {
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

  const allCount = services.length;
  services = services.filter((s) => isAllowedCategory(s.category));
  logger.info(`Fetched ${allCount} services from provider, ${services.length} match allowed categories (YouTube, Facebook)`);

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  const globalMargin = await getDefaultProfitMargin();

  for (const svc of services) {
    const originalPrice = new Prisma.Decimal(svc.rate);
    const sellingPrice = calculateSellingPrice(originalPrice, globalMargin);

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
            profitMargin: globalMargin,
            isMarginOverride: false,
            minQuantity: parseInt(svc.min, 10),
            maxQuantity: parseInt(svc.max, 10),
            type: mapServiceType(svc.type),
            isActive: true,
          },
        });
        created++;
      } else {
        // Existing service — check if provider price changed
        const effectiveMargin = existing.isMarginOverride ? existing.profitMargin : globalMargin;
        const priceChanged = !existing.originalPrice.equals(originalPrice);
        const marginChanged = !existing.isMarginOverride && !existing.profitMargin.equals(globalMargin);
        const detailsChanged =
          existing.name !== svc.name ||
          existing.category !== svc.category ||
          existing.description !== (svc.description || null) ||
          existing.minQuantity !== parseInt(svc.min, 10) ||
          existing.maxQuantity !== parseInt(svc.max, 10) ||
          existing.type !== mapServiceType(svc.type) ||
          !existing.isActive;

        if (priceChanged || marginChanged || detailsChanged) {
          const updateData: Prisma.ServiceUpdateInput = {
            name: svc.name,
            category: svc.category,
            description: svc.description || null,
            minQuantity: parseInt(svc.min, 10),
            maxQuantity: parseInt(svc.max, 10),
            type: mapServiceType(svc.type),
            isActive: true,
          };

          if (priceChanged || marginChanged) {
            updateData.originalPrice = originalPrice;
            updateData.sellingPrice = calculateSellingPrice(originalPrice, effectiveMargin);
            updateData.profitMargin = effectiveMargin;

            logger.warn('Service retail price recalculated', {
              serviceId: svc.serviceId,
              name: svc.name,
              oldPrice: existing.originalPrice.toString(),
              newPrice: originalPrice.toString(),
              margin: effectiveMargin.toString(),
              isMarginOverride: existing.isMarginOverride,
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

  // Deactivate services no longer in provider catalog
  const activeProviderIds = new Set(services.map((s) => s.serviceId));
  const deactivated = await prisma.service.updateMany({
    where: {
      isActive: true,
      providerServiceId: { notIn: [...activeProviderIds] },
    },
    data: { isActive: false },
  });

  if (deactivated.count > 0) {
    logger.warn('Deactivated services removed by provider', {
      count: deactivated.count,
    });
  }

  const elapsed = Date.now() - startTime;
  logger.info('Service sync completed', {
    created,
    updated,
    unchanged,
    deactivated: deactivated.count,
    total: services.length,
    durationMs: elapsed,
  });
}

// ── Entrypoint (only when run directly, not imported) ───────
if (require.main === module) {
  (async () => {
    logger.info('Sync Services Worker started');
    await syncServices();
    await prisma.$disconnect();
    process.exit(0);
  })().catch((err) => {
    logger.error('Sync Services Worker crashed', { error: err });
    process.exit(1);
  });
}
