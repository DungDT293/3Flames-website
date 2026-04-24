import { Router, Request, Response, NextFunction } from 'express';
import { Prisma, TransactionType, OrderStatus, UserStatus } from '@prisma/client';
import { prisma } from '../../../shared/infrastructure/database';
import { validate } from '../../../shared/infrastructure/middleware/validate.middleware';
import { BalanceService } from '../../transaction/application/balance.service';
import { CircuitBreaker } from '../../../shared/infrastructure/circuit-breaker';
import { listUsersSchema, adjustBalanceSchema, suspendUserSchema } from '../presentation/schemas/admin.schema';
import { logger } from '../../../shared/infrastructure/logger';

const balanceService = new BalanceService();
const circuitBreaker = new CircuitBreaker();

export const adminRouter = Router();

// ─────────────────────────────────────────────────────────────
// GET /api/v1/admin/users
// Paginated user list with search (email/username) and filters
// ─────────────────────────────────────────────────────────────
adminRouter.get(
  '/users',
  validate(listUsersSchema, 'query'),
  async (req: Request, res: Response) => {
    const { page, limit, search, status, role } = req.query as unknown as {
      page: number;
      limit: number;
      search?: string;
      status?: string;
      role?: string;
    };

    const offset = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      ...(status && { status: status as never }),
      ...(role && { role: role as never }),
      ...(search && {
        OR: [
          { email: { contains: search, mode: 'insensitive' as const } },
          { username: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          username: true,
          balance: true,
          role: true,
          status: true,
          createdAt: true,
          _count: { select: { orders: true, transactions: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      data: users.map((u) => {
        const { _count, ...rest } = u;
        return {
          ...rest,
          balance: u.balance.toString(),
          totalOrders: _count.orders,
          totalTransactions: _count.transactions,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  },
);

// ─────────────────────────────────────────────────────────────
// POST /api/v1/admin/users/:id/balance
// Manual balance adjustment using BalanceService (FOR UPDATE).
// Logs with ADMIN_CREDIT or ADMIN_DEBIT transaction type.
// ─────────────────────────────────────────────────────────────
adminRouter.post(
  '/users/:id/balance',
  validate(adjustBalanceSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetUserId = req.params.id;
      const { amount, type, description } = req.body as {
        amount: number;
        type: 'ADD' | 'DEDUCT';
        description: string;
      };

      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, username: true },
      });

      if (!targetUser) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const decimalAmount = new Prisma.Decimal(amount);
      const adminUsername = req.user!.username;
      const fullDescription = `Manual adjustment by Admin @${adminUsername}: ${description}`;

      let result;

      if (type === 'ADD') {
        result = await balanceService.credit(
          targetUserId,
          decimalAmount,
          TransactionType.ADMIN_CREDIT,
          fullDescription,
        );
      } else {
        result = await balanceService.deduct(
          targetUserId,
          decimalAmount,
          '',  // no associated order
          fullDescription,
        );
      }

      logger.info('Admin balance adjustment', {
        adminId: req.user!.id,
        targetUserId,
        type,
        amount: amount.toString(),
        newBalance: result.newBalance.toString(),
      });

      res.json({
        message: `Balance ${type === 'ADD' ? 'credited' : 'deducted'} successfully`,
        userId: targetUserId,
        adjustment: { type, amount: amount.toString() },
        previousBalance: result.previousBalance.toString(),
        newBalance: result.newBalance.toString(),
        transactionId: result.transactionId,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/v1/admin/stats
// System-wide dashboard: revenue, profit, users, orders
// ─────────────────────────────────────────────────────────────
adminRouter.get('/stats', async (_req: Request, res: Response) => {
  const [
    totalUsers,
    activeUsers,
    totalOrders,
    completedOrders,
    revenueResult,
    profitResult,
    totalDeposits,
  ] = await Promise.all([
    // Total registered users
    prisma.user.count(),

    // Active users (placed at least 1 order in last 30 days)
    prisma.user.count({
      where: {
        orders: {
          some: {
            createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        },
      },
    }),

    // Total orders ever
    prisma.order.count(),

    // Completed orders
    prisma.order.count({
      where: { status: OrderStatus.COMPLETED },
    }),

    // Total revenue: sum of charge on completed orders
    prisma.order.aggregate({
      _sum: { charge: true },
      where: { status: { in: [OrderStatus.COMPLETED, OrderStatus.PARTIAL] } },
    }),

    // Total profit: sum(sellingPrice - originalPrice) per completed order unit
    // Raw query for precision — joins orders with services
    prisma.$queryRaw<[{ profit: string }]>`
      SELECT COALESCE(SUM(
        (s.selling_price - s.original_price) / 1000 * o.quantity
      ), 0)::text AS profit
      FROM orders o
      JOIN services s ON o.service_id = s.id
      WHERE o.status IN ('COMPLETED', 'PARTIAL')
    `,

    // Total deposits ever
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { type: TransactionType.DEPOSIT },
    }),
  ]);

  res.json({
    users: {
      total: totalUsers,
      active30d: activeUsers,
    },
    orders: {
      total: totalOrders,
      completed: completedOrders,
    },
    financials: {
      totalRevenue: revenueResult._sum.charge?.toString() || '0',
      totalProfit: profitResult[0]?.profit || '0',
      totalDeposits: totalDeposits._sum.amount?.toString() || '0',
    },
  });
});

// ─────────────────────────────────────────────────────────────
// POST /api/v1/admin/users/:id/suspend
// Suspend a user account. Immediately blocks all API access
// (authMiddleware checks status on every request).
// ─────────────────────────────────────────────────────────────
adminRouter.post(
  '/users/:id/suspend',
  validate(suspendUserSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetUserId = req.params.id;
      const { reason } = req.body as { reason: string };

      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, username: true, status: true, role: true },
      });

      if (!targetUser) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (targetUser.role === 'ADMIN') {
        res.status(403).json({ error: 'Cannot suspend an admin account' });
        return;
      }

      if (targetUser.status === 'SUSPENDED') {
        res.status(409).json({ error: 'User is already suspended' });
        return;
      }

      await prisma.user.update({
        where: { id: targetUserId },
        data: { status: UserStatus.SUSPENDED },
      });

      logger.warn('User suspended by admin', {
        adminId: req.user!.id,
        targetUserId,
        targetUsername: targetUser.username,
        reason,
      });

      res.json({
        message: 'User suspended successfully',
        userId: targetUserId,
        username: targetUser.username,
        reason,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /api/v1/admin/users/:id/unsuspend
// Reactivate a suspended user account.
// ─────────────────────────────────────────────────────────────
adminRouter.post(
  '/users/:id/unsuspend',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetUserId = req.params.id;

      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, username: true, status: true },
      });

      if (!targetUser) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (targetUser.status !== 'SUSPENDED') {
        res.status(409).json({ error: 'User is not currently suspended' });
        return;
      }

      await prisma.user.update({
        where: { id: targetUserId },
        data: { status: UserStatus.ACTIVE },
      });

      logger.info('User unsuspended by admin', {
        adminId: req.user!.id,
        targetUserId,
        targetUsername: targetUser.username,
      });

      res.json({
        message: 'User reactivated successfully',
        userId: targetUserId,
        username: targetUser.username,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/v1/admin/circuit-breaker
// View current circuit breaker state.
// ─────────────────────────────────────────────────────────────
adminRouter.get('/circuit-breaker', async (_req: Request, res: Response) => {
  const status = await circuitBreaker.getStatus();
  res.json(status);
});

// ─────────────────────────────────────────────────────────────
// POST /api/v1/admin/circuit-breaker/reset
// Manually reset the circuit breaker (re-enable order intake).
// ─────────────────────────────────────────────────────────────
adminRouter.post(
  '/circuit-breaker/reset',
  async (req: Request, res: Response) => {
    await circuitBreaker.reset();

    logger.info('Circuit breaker manually reset by admin', {
      adminId: req.user!.id,
    });

    res.json({ message: 'Circuit breaker reset — order intake re-enabled' });
  },
);
