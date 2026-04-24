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
      throw new Error('Service not found or inactive');
    }

    if (input.quantity < service.minQuantity || input.quantity > service.maxQuantity) {
      throw new Error(
        `Quantity must be between ${service.minQuantity} and ${service.maxQuantity}`,
      );
    }

    // Calculate charge: (sellingPrice / 1000) * quantity
    const charge = service.sellingPrice
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
      const providerResult = await this.providerApi.placeOrder({
        serviceId: service.providerServiceId,
        link: input.link,
        quantity: input.quantity,
      });

      // Update order with provider's order ID, move to PROCESSING
      await prisma.order.update({
        where: { id: order.id },
        data: {
          apiOrderId: providerResult.orderId,
          status: OrderStatus.PROCESSING,
        },
      });

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
      // If provider call fails AFTER balance deduction, refund and mark ERROR
      if (error instanceof InsufficientBalanceError) {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.CANCELED },
        });
        throw error;
      }

      // Provider failed — auto-refund
      try {
        await this.balanceService.credit(
          input.userId,
          charge,
          'REFUND',
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

      throw error;
    }
  }
}
