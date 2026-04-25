import { Prisma, OrderStatus } from '@prisma/client';
import { prisma } from '../../../shared/infrastructure/database';
import { logger } from '../../../shared/infrastructure/logger';
import { IProviderApiClient } from '../../provider/domain/provider-api.interface';
import { BalanceService, InsufficientBalanceError } from '../../transaction/application/balance.service';

export interface CreateOrderInput {
  userId: string;
  serviceId: string;
  link: string;
  quantity: number;
}

export interface CreateOrderResult {
  orderId: string;
  apiOrderId: string;
  charge: Prisma.Decimal;
  newBalance: Prisma.Decimal;
}

export class OrderService {
  constructor(
    private readonly providerApi: IProviderApiClient,
    private readonly balanceService: BalanceService,
  ) {}

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const service = await prisma.service.findUnique({
      where: { id: input.serviceId },
    });

    if (!service || !service.isActive) {
      throw new ServiceNotFoundError();
    }

    if (input.quantity < service.minQuantity || input.quantity > service.maxQuantity) {
      throw new InvalidQuantityError(service.minQuantity, service.maxQuantity);
    }

    // Calculate charge: (sellingPrice / 1000) * quantity
    const charge = service.sellingPrice
      .div(1000)
      .mul(input.quantity)
      .toDecimalPlaces(6);
    const cost = service.originalPrice
      .div(1000)
      .mul(input.quantity)
      .toDecimalPlaces(6);

    // Create order record first (PENDING state, no charge yet)
    const order = await prisma.order.create({
      data: {
        userId: input.userId,
        serviceId: input.serviceId,
        link: input.link,
        quantity: input.quantity,
        charge,
        cost,
        status: OrderStatus.PENDING,
      },
    });

    try {
      // Deduct balance (with FOR UPDATE lock)
      const balanceResult = await this.balanceService.deduct(
        input.userId,
        charge,
        order.id,
        `Order #${order.id.slice(0, 8)} — ${service.name} x${input.quantity}`,
      );

      // Place order with provider
      let providerResult;
      try {
        providerResult = await this.providerApi.placeOrder({
          serviceId: service.providerServiceId,
          link: input.link,
          quantity: input.quantity,
        });
      } catch (providerError) {
        // Provider failed BEFORE accepting the order — safe to refund
        try {
          await this.balanceService.credit(
            input.userId,
            charge,
            'REFUND' as any,
            `Auto-refund: provider error for order #${order.id.slice(0, 8)}`,
            order.id,
          );
        } catch (refundError) {
          logger.error('CRITICAL: Failed to auto-refund after provider error', {
            orderId: order.id,
            userId: input.userId,
            charge: charge.toString(),
            refundError,
          });
        }

        await prisma.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.ERROR },
        });

        throw providerError;
      }

      // Provider succeeded — update local DB
      try {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            apiOrderId: providerResult.orderId,
            status: OrderStatus.PROCESSING,
          },
        });
      } catch (dbError) {
        // Provider accepted the order but local DB update failed.
        // Do NOT refund — the provider IS processing the order.
        // Mark as pending reconciliation so the sync worker can fix it.
        logger.error('CRITICAL: Provider accepted order but local DB update failed — DO NOT REFUND', {
          orderId: order.id,
          apiOrderId: providerResult.orderId,
          userId: input.userId,
          charge: charge.toString(),
          dbError,
        });
        throw dbError;
      }

      logger.info('Order placed successfully', {
        orderId: order.id,
        apiOrderId: providerResult.orderId,
        charge: charge.toString(),
      });

      return {
        orderId: order.id,
        apiOrderId: providerResult.orderId,
        charge,
        newBalance: balanceResult.newBalance,
      };
    } catch (error) {
      if (error instanceof InsufficientBalanceError) {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.CANCELED },
        });
      }
      throw error;
    }
  }
}

export class ServiceNotFoundError extends Error {
  constructor() {
    super('Service not found or inactive');
    this.name = 'ServiceNotFoundError';
  }
}

export class InvalidQuantityError extends Error {
  constructor(public readonly min: number, public readonly max: number) {
    super(`Quantity must be between ${min} and ${max}`);
    this.name = 'InvalidQuantityError';
  }
}
