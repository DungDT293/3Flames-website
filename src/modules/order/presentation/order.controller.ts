import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../../shared/infrastructure/database';
import { validate } from '../../../shared/infrastructure/middleware/validate.middleware';
import { orderLimiter } from '../../../shared/infrastructure/middleware/rate-limit.middleware';
import { maintenanceGuard } from '../../../shared/infrastructure/middleware/maintenance.middleware';
import { requireCurrentTos } from '../../../shared/infrastructure/middleware/tos.middleware';
import { createOrderSchema, listOrdersSchema } from './schemas/order.schema';
import { OrderService } from '../application/order.service';
import { BalanceService } from '../../transaction/application/balance.service';
import { TheYTlabApiClient } from '../../provider/infrastructure/theytlab-api.client';

const providerApi = new TheYTlabApiClient();
const balanceService = new BalanceService();
const orderService = new OrderService(providerApi, balanceService);

export const orderRouter = Router();

// ─────────────────────────────────────────────────────────────
// POST /api/v1/orders
//
// Flow:
//   1. Zod validates { service_id, link, quantity }
//   2. Rate limiter throttles abuse (30/min per IP)
//   3. OrderService.createOrder handles:
//      - Service lookup + validation
//      - Charge calculation (sellingPrice / 1000 * quantity)
//      - Balance deduction with FOR UPDATE lock
//      - Provider API call (placeOrder)
//      - Auto-refund on provider failure
// ─────────────────────────────────────────────────────────────
orderRouter.post(
  '/',
  maintenanceGuard,
  requireCurrentTos,
  orderLimiter,
  validate(createOrderSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { service_id, link, quantity } = req.body;

      const result = await orderService.createOrder({
        userId: req.user!.id,
        serviceId: service_id,
        link,
        quantity,
      });

      res.status(201).json({
        message: 'Order placed successfully',
        order: {
          id: result.orderId,
          apiOrderId: result.apiOrderId,
          charge: result.charge.toString(),
        },
        newBalance: result.newBalance.toString(),
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/v1/orders
// Returns paginated order history for the authenticated user.
// Supports optional ?status= filter.
// ─────────────────────────────────────────────────────────────
orderRouter.get(
  '/',
  validate(listOrdersSchema, 'query'),
  async (req: Request, res: Response) => {
    const { page, limit, status } = req.query as unknown as {
      page: number;
      limit: number;
      status?: string;
    };

    const offset = (page - 1) * limit;

    const where = {
      userId: req.user!.id,
      ...(status && { status: status as never }),
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        select: {
          id: true,
          apiOrderId: true,
          link: true,
          quantity: true,
          charge: true,
          status: true,
          startCount: true,
          remains: true,
          createdAt: true,
          service: {
            select: { id: true, name: true, category: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      data: orders.map((o) => ({
        ...o,
        charge: o.charge.toString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  },
);

// GET /api/v1/orders/:id
orderRouter.get('/:id', async (req: Request, res: Response) => {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
    select: {
      id: true,
      apiOrderId: true,
      link: true,
      quantity: true,
      charge: true,
      status: true,
      startCount: true,
      remains: true,
      createdAt: true,
      updatedAt: true,
      service: {
        select: { id: true, name: true, category: true },
      },
    },
  });

  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  res.json({
    ...order,
    charge: order.charge.toString(),
  });
});
