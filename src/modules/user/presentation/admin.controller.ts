import { Router, Request, Response, NextFunction } from 'express';
import { DepositStatus, Prisma, TransactionType, OrderStatus, UserStatus, UserRole } from '@prisma/client';
import { prisma } from '../../../shared/infrastructure/database';
import { requireRole } from '../../../shared/infrastructure/middleware/auth.middleware';
import { validate } from '../../../shared/infrastructure/middleware/validate.middleware';
import { BalanceService } from '../../transaction/application/balance.service';
import { CircuitBreaker } from '../../../shared/infrastructure/circuit-breaker';
import { publishUserEvent } from '../../../shared/infrastructure/event-bus';
import { config } from '../../../config';
import {
  listUsersSchema,
  adjustBalanceSchema,
  suspendUserSchema,
  updateUserRoleSchema,
  listDepositRequestsSchema,
  confirmDepositSchema,
  rejectDepositSchema,
  listAuditLogsSchema,
  adminAnalyticsSchema,
  listPricingServicesSchema,
  updateMarginSchema,
} from '../presentation/schemas/admin.schema';
import { logger } from '../../../shared/infrastructure/logger';

const balanceService = new BalanceService();
const circuitBreaker = new CircuitBreaker();
const PRICING_MARGIN_KEY = 'pricing.defaultProfitMargin';
const REVENUE_STATUSES = [
  OrderStatus.PENDING,
  OrderStatus.PROCESSING,
  OrderStatus.IN_PROGRESS,
  OrderStatus.COMPLETED,
  OrderStatus.PARTIAL,
];

type AnalyticsPeriod = 'day' | 'month';
type AuditActorRole = UserRole | 'SYSTEM';

const ROLE_RANK: Record<UserRole, number> = {
  [UserRole.USER]: 0,
  [UserRole.SUPPORT]: 1,
  [UserRole.ADMIN]: 2,
  [UserRole.SUPER_ADMIN]: 3,
};

function canViewAuditRole(actorRole: UserRole, requestedRole: AuditActorRole | undefined): boolean {
  if (!requestedRole || requestedRole === 'SYSTEM') return true;
  return ROLE_RANK[actorRole] >= ROLE_RANK[requestedRole];
}

function visibleAuditRoles(actorRole: UserRole): UserRole[] {
  return Object.values(UserRole).filter((role) => ROLE_RANK[role] <= ROLE_RANK[actorRole]);
}

function canManageRole(actorRole: string, targetRole: string): boolean {
  if (actorRole === UserRole.SUPER_ADMIN) return true;
  if (actorRole === UserRole.ADMIN) return targetRole === UserRole.USER || targetRole === UserRole.SUPPORT;
  return false;
}

function canAssignRole(actorRole: string, newRole: UserRole): boolean {
  if (actorRole === UserRole.SUPER_ADMIN) return true;
  if (actorRole === UserRole.ADMIN) return newRole === UserRole.USER || newRole === UserRole.SUPPORT;
  return false;
}

function getRequestIp(req: Request): string | undefined {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string') return forwardedFor.split(',')[0]?.trim();
  return req.ip || req.socket.remoteAddress || undefined;
}

function calculateSellingPrice(originalPrice: Prisma.Decimal, marginPercent: Prisma.Decimal.Value): Prisma.Decimal {
  return originalPrice.mul(new Prisma.Decimal(marginPercent).div(100).plus(1)).toDecimalPlaces(6);
}

function toDecimalString(value: Prisma.Decimal | null | undefined): string {
  return value?.toString() ?? '0';
}

function changePercent(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function bucketKey(date: Date, period: AnalyticsPeriod): string {
  if (period === 'day') return date.toISOString().slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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

async function setDefaultProfitMargin(margin: Prisma.Decimal): Promise<void> {
  await prisma.adminSetting.upsert({
    where: { key: PRICING_MARGIN_KEY },
    create: { key: PRICING_MARGIN_KEY, value: margin.toNumber() },
    update: { value: margin.toNumber() },
  });
}

async function createAuditLog(input: {
  actorId?: string;
  targetId?: string;
  action: string;
  entity: string;
  oldData?: Prisma.InputJsonValue;
  newData?: Prisma.InputJsonValue;
  ipAddress?: string;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      targetId: input.targetId,
      action: input.action,
      entity: input.entity,
      oldData: input.oldData ?? Prisma.JsonNull,
      newData: input.newData ?? Prisma.JsonNull,
      ipAddress: input.ipAddress,
    },
  });
}

export const adminRouter = Router();

adminRouter.get(
  '/logs',
  requireRole(UserRole.ADMIN),
  validate(listAuditLogsSchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const offset = (page - 1) * limit;
      const actorRole = typeof req.query.actorRole === 'string' ? req.query.actorRole as AuditActorRole : undefined;

      if (!canViewAuditRole(req.user!.role as UserRole, actorRole)) {
        res.status(403).json({ error: 'You cannot view audit logs from a higher role' });
        return;
      }

      const allowedRoles = visibleAuditRoles(req.user!.role as UserRole);
      const where: Prisma.AuditLogWhereInput = actorRole === 'SYSTEM'
        ? { actorId: null }
        : actorRole
          ? { actor: { role: actorRole } }
          : { OR: [{ actorId: null }, { actor: { role: { in: allowedRoles } } }] };

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          select: {
            id: true,
            actorId: true,
            targetId: true,
            action: true,
            entity: true,
            oldData: true,
            newData: true,
            ipAddress: true,
            createdAt: true,
            actor: { select: { id: true, username: true, email: true, role: true } },
            target: { select: { id: true, username: true, email: true, role: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
        }),
        prisma.auditLog.count({ where }),
      ]);

      res.json({
        data: logs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get(
  '/deposits',
  requireRole(UserRole.ADMIN),
  validate(listDepositRequestsSchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      const offset = (page - 1) * limit;

      const where: Prisma.DepositRequestWhereInput = {
        ...(status && { status: status as DepositStatus }),
        ...(search && {
          OR: [
            { memo: { contains: search, mode: 'insensitive' as const } },
            { user: { email: { contains: search, mode: 'insensitive' as const } } },
            { user: { username: { contains: search, mode: 'insensitive' as const } } },
          ],
        }),
      };

      const [deposits, total] = await Promise.all([
        prisma.depositRequest.findMany({
          where,
          select: {
            id: true,
            userId: true,
            memo: true,
            amountVnd: true,
            status: true,
            providerPaymentId: true,
            transactionId: true,
            expiresAt: true,
            createdAt: true,
            updatedAt: true,
            user: {
              select: {
                id: true,
                email: true,
                username: true,
                balance: true,
                status: true,
                role: true,
              },
            },
          },
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
          skip: offset,
          take: limit,
        }),
        prisma.depositRequest.count({ where }),
      ]);

      res.json({
        data: deposits.map((deposit) => ({
          ...deposit,
          user: { ...deposit.user, balance: deposit.user.balance.toString() },
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.post(
  '/deposits/:id/confirm',
  requireRole(UserRole.ADMIN),
  validate(confirmDepositSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    const depositId = String(req.params.id);
    const { providerPaymentId, note } = req.body as { providerPaymentId?: string; note?: string };

    try {
      const claimed = await prisma.depositRequest.updateMany({
        where: { id: depositId, status: DepositStatus.PENDING, transactionId: null },
        data: {
          status: DepositStatus.CONFIRMED,
          ...(providerPaymentId ? { providerPaymentId } : {}),
        },
      });

      if (claimed.count === 0) {
        res.status(409).json({ error: 'Deposit has already been processed or does not exist' });
        return;
      }

      const deposit = await prisma.depositRequest.findUnique({
        where: { id: depositId },
        select: {
          id: true,
          userId: true,
          memo: true,
          amountVnd: true,
          status: true,
          providerPaymentId: true,
          user: { select: { id: true, username: true, email: true, balance: true } },
        },
      });

      if (!deposit) {
        res.status(404).json({ error: 'Deposit not found' });
        return;
      }

      try {
        const amount = new Prisma.Decimal(deposit.amountVnd);
        const result = await balanceService.credit(
          deposit.userId,
          amount,
          TransactionType.DEPOSIT,
          `Manual deposit confirmation by Admin @${req.user!.username} — Memo: ${deposit.memo}${note ? ` — ${note}` : ''}`,
        );

        await prisma.depositRequest.update({
          where: { id: deposit.id },
          data: { transactionId: result.transactionId },
        });

        await createAuditLog({
          actorId: req.user!.id,
          targetId: deposit.userId,
          action: 'CONFIRM_DEPOSIT',
          entity: 'DepositRequest',
          oldData: { status: DepositStatus.PENDING, memo: deposit.memo, amountVnd: deposit.amountVnd },
          newData: {
            status: DepositStatus.CONFIRMED,
            memo: deposit.memo,
            amountVnd: deposit.amountVnd,
            providerPaymentId: deposit.providerPaymentId,
            transactionId: result.transactionId,
            note,
          },
          ipAddress: getRequestIp(req),
        });

        await publishUserEvent(deposit.userId, {
          type: 'DEPOSIT_SUCCESS',
          amount: amount.toString(),
          newBalance: result.newBalance.toString(),
          transactionId: result.transactionId,
          timestamp: new Date().toISOString(),
        });

        res.json({
          message: 'Deposit confirmed successfully',
          depositId: deposit.id,
          userId: deposit.userId,
          amount: amount.toString(),
          previousBalance: result.previousBalance.toString(),
          newBalance: result.newBalance.toString(),
          transactionId: result.transactionId,
        });
      } catch (error) {
        await prisma.depositRequest.updateMany({
          where: { id: depositId, status: DepositStatus.CONFIRMED, transactionId: null },
          data: { status: DepositStatus.PENDING, providerPaymentId: null },
        });
        throw error;
      }
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.post(
  '/deposits/:id/reject',
  requireRole(UserRole.ADMIN),
  validate(rejectDepositSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const depositId = String(req.params.id);
      const { reason } = req.body as { reason: string };

      const deposit = await prisma.depositRequest.findUnique({
        where: { id: depositId },
        select: { id: true, userId: true, memo: true, amountVnd: true, status: true },
      });

      if (!deposit) {
        res.status(404).json({ error: 'Deposit not found' });
        return;
      }

      if (deposit.status !== DepositStatus.PENDING) {
        res.status(409).json({ error: 'Deposit has already been processed' });
        return;
      }

      await prisma.$transaction([
        prisma.depositRequest.update({
          where: { id: depositId },
          data: { status: DepositStatus.FAILED },
        }),
        prisma.auditLog.create({
          data: {
            actorId: req.user!.id,
            targetId: deposit.userId,
            action: 'REJECT_DEPOSIT',
            entity: 'DepositRequest',
            oldData: { status: deposit.status, memo: deposit.memo, amountVnd: deposit.amountVnd },
            newData: { status: DepositStatus.FAILED, reason },
            ipAddress: getRequestIp(req),
          },
        }),
      ]);

      res.json({ message: 'Deposit rejected successfully', depositId, status: DepositStatus.FAILED });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get(
  '/users',
  requireRole(UserRole.SUPPORT),
  validate(listUsersSchema, 'query'),
  async (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;

    const offset = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      ...(status && { status: status as UserStatus }),
      ...(role && { role: role as UserRole }),
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
          phone: true,
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

adminRouter.get(
  '/users/:id',
  requireRole(UserRole.SUPPORT),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetUserId = String(req.params.id);
      const user = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: {
          id: true,
          email: true,
          username: true,
          phone: true,
          balance: true,
          role: true,
          status: true,
          acceptedTosVersion: true,
          isEmailVerified: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { orders: true, transactions: true, depositRequests: true } },
        },
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const [orders, deposits, transactions, activity] = await Promise.all([
        prisma.order.findMany({
          where: { userId: targetUserId },
          select: {
            id: true,
            link: true,
            quantity: true,
            charge: true,
            cost: true,
            status: true,
            startCount: true,
            remains: true,
            apiOrderId: true,
            createdAt: true,
            updatedAt: true,
            service: { select: { id: true, name: true, category: true, type: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        prisma.depositRequest.findMany({
          where: { userId: targetUserId },
          select: {
            id: true,
            memo: true,
            amountVnd: true,
            status: true,
            providerPaymentId: true,
            transactionId: true,
            expiresAt: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        prisma.transaction.findMany({
          where: { userId: targetUserId },
          select: { id: true, type: true, amount: true, balanceAfter: true, orderId: true, description: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        prisma.auditLog.findMany({
          where: { OR: [{ actorId: targetUserId }, { targetId: targetUserId }] },
          select: {
            id: true,
            actorId: true,
            targetId: true,
            action: true,
            entity: true,
            oldData: true,
            newData: true,
            ipAddress: true,
            createdAt: true,
            actor: { select: { id: true, username: true, email: true, role: true } },
            target: { select: { id: true, username: true, email: true, role: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
      ]);

      const { _count, ...profile } = user;

      res.json({
        user: {
          ...profile,
          balance: user.balance.toString(),
          totalOrders: _count.orders,
          totalTransactions: _count.transactions,
          totalDeposits: _count.depositRequests,
        },
        orders: orders.map((order) => ({
          ...order,
          charge: order.charge.toString(),
          cost: order.cost.toString(),
        })),
        deposits,
        transactions: transactions.map((transaction) => ({
          ...transaction,
          amount: transaction.amount.toString(),
          balanceAfter: transaction.balanceAfter.toString(),
        })),
        activity,
      });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.post(
  '/users/:id/balance',
  requireRole(UserRole.ADMIN),
  validate(adjustBalanceSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetUserId = String(req.params.id);
      const { amount, type, description } = req.body as {
        amount: number;
        type: 'ADD' | 'DEDUCT';
        description: string;
      };

      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, username: true, role: true, balance: true },
      });

      if (!targetUser) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (!canManageRole(req.user!.role, targetUser.role)) {
        res.status(403).json({ error: 'You do not have permission to adjust this account' });
        return;
      }

      const decimalAmount = new Prisma.Decimal(amount);
      const fullDescription = `Manual adjustment by Admin @${req.user!.username}: ${description}`;
      const result = type === 'ADD'
        ? await balanceService.credit(targetUserId, decimalAmount, TransactionType.ADMIN_CREDIT, fullDescription)
        : await balanceService.adminDebit(targetUserId, decimalAmount, fullDescription);

      await createAuditLog({
        actorId: req.user!.id,
        targetId: targetUserId,
        action: type === 'ADD' ? 'ADD_BALANCE' : 'DEDUCT_BALANCE',
        entity: 'User',
        oldData: { balance: targetUser.balance.toString() },
        newData: {
          balance: result.newBalance.toString(),
          amount: amount.toString(),
          description,
          transactionId: result.transactionId,
        },
        ipAddress: getRequestIp(req),
      });

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

adminRouter.get('/stats', requireRole(UserRole.ADMIN), async (_req: Request, res: Response) => {
  const [
    totalUsers,
    activeUsers,
    totalOrders,
    completedOrders,
    revenueResult,
    profitResult,
    totalDeposits,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({
      where: {
        orders: {
          some: {
            createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        },
      },
    }),
    prisma.order.count(),
    prisma.order.count({ where: { status: OrderStatus.COMPLETED } }),
    prisma.order.aggregate({
      _sum: { charge: true },
      where: { status: { in: [OrderStatus.COMPLETED, OrderStatus.PARTIAL] } },
    }),
    prisma.$queryRaw<[{ profit: string }]>`
      SELECT COALESCE(SUM(o.charge - o.cost), 0)::text AS profit
      FROM orders o
      WHERE o.status IN ('COMPLETED', 'PARTIAL')
    `,
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
      totalRevenue: toDecimalString(revenueResult._sum.charge),
      totalProfit: profitResult[0]?.profit || '0',
      totalDeposits: toDecimalString(totalDeposits._sum.amount),
    },
  });
});

adminRouter.get(
  '/analytics',
  requireRole(UserRole.ADMIN),
  validate(adminAnalyticsSchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const period = req.query.period === 'month' ? 'month' : 'day';
      const now = new Date();
      const currentStart = period === 'day' ? startOfDay(now) : startOfMonth(now);
      const currentEnd = period === 'day' ? addDays(currentStart, 1) : addMonths(currentStart, 1);
      const previousStart = period === 'day' ? addDays(currentStart, -1) : addMonths(currentStart, -1);
      const previousEnd = currentStart;
      const seriesStart = period === 'day' ? addDays(currentStart, -29) : addMonths(currentStart, -11);
      const bucketUnit = period === 'day' ? 'day' : 'month';
      const revenueStatusSql = Prisma.join(REVENUE_STATUSES.map((status) => Prisma.sql`${status}::"OrderStatus"`));

      const [currentOrders, previousOrders, currentUsers, previousUsers, currentDeposits, previousDeposits, orderSeries, userSeries, depositSeries] = await Promise.all([
        prisma.order.aggregate({
          _sum: { charge: true, cost: true },
          _count: true,
          where: { createdAt: { gte: currentStart, lt: currentEnd }, status: { in: REVENUE_STATUSES } },
        }),
        prisma.order.aggregate({
          _sum: { charge: true, cost: true },
          _count: true,
          where: { createdAt: { gte: previousStart, lt: previousEnd }, status: { in: REVENUE_STATUSES } },
        }),
        prisma.user.count({ where: { createdAt: { gte: currentStart, lt: currentEnd } } }),
        prisma.user.count({ where: { createdAt: { gte: previousStart, lt: previousEnd } } }),
        prisma.transaction.aggregate({
          _sum: { amount: true },
          where: { type: TransactionType.DEPOSIT, createdAt: { gte: currentStart, lt: currentEnd } },
        }),
        prisma.transaction.aggregate({
          _sum: { amount: true },
          where: { type: TransactionType.DEPOSIT, createdAt: { gte: previousStart, lt: previousEnd } },
        }),
        prisma.$queryRaw<Array<{ bucket: Date; revenue: string; profit: string; orders: bigint }>>`
          SELECT date_trunc(${bucketUnit}, created_at) AS bucket,
            COALESCE(SUM(charge), 0)::text AS revenue,
            COALESCE(SUM(charge - cost), 0)::text AS profit,
            COUNT(*)::bigint AS orders
          FROM orders
          WHERE created_at >= ${seriesStart}
            AND status IN (${revenueStatusSql})
          GROUP BY bucket
          ORDER BY bucket ASC
        `,
        prisma.$queryRaw<Array<{ bucket: Date; users: bigint }>>`
          SELECT date_trunc(${bucketUnit}, created_at) AS bucket,
            COUNT(*)::bigint AS users
          FROM users
          WHERE created_at >= ${seriesStart}
          GROUP BY bucket
          ORDER BY bucket ASC
        `,
        prisma.$queryRaw<Array<{ bucket: Date; deposits: string }>>`
          SELECT date_trunc(${bucketUnit}, created_at) AS bucket,
            COALESCE(SUM(amount), 0)::text AS deposits
          FROM transactions
          WHERE created_at >= ${seriesStart}
            AND type = ${TransactionType.DEPOSIT}::"TransactionType"
          GROUP BY bucket
          ORDER BY bucket ASC
        `,
      ]);

      const seriesMap = new Map<string, { bucket: string; revenue: string; profit: string; orders: number; users: number; deposits: string }>();
      const bucketCount = period === 'day' ? 30 : 12;
      for (let i = 0; i < bucketCount; i++) {
        const bucketDate = period === 'day' ? addDays(seriesStart, i) : addMonths(seriesStart, i);
        const key = bucketKey(bucketDate, period);
        seriesMap.set(key, { bucket: key, revenue: '0', profit: '0', orders: 0, users: 0, deposits: '0' });
      }

      for (const row of orderSeries) {
        const key = bucketKey(new Date(row.bucket), period);
        const item = seriesMap.get(key);
        if (item) Object.assign(item, { revenue: row.revenue, profit: row.profit, orders: Number(row.orders) });
      }
      for (const row of userSeries) {
        const key = bucketKey(new Date(row.bucket), period);
        const item = seriesMap.get(key);
        if (item) item.users = Number(row.users);
      }
      for (const row of depositSeries) {
        const key = bucketKey(new Date(row.bucket), period);
        const item = seriesMap.get(key);
        if (item) item.deposits = row.deposits;
      }

      const currentRevenue = Number(currentOrders._sum.charge ?? 0);
      const previousRevenue = Number(previousOrders._sum.charge ?? 0);
      const currentProfit = Number((currentOrders._sum.charge ?? new Prisma.Decimal(0)).minus(currentOrders._sum.cost ?? 0));
      const previousProfit = Number((previousOrders._sum.charge ?? new Prisma.Decimal(0)).minus(previousOrders._sum.cost ?? 0));
      const currentDepositValue = Number(currentDeposits._sum.amount ?? 0);
      const previousDepositValue = Number(previousDeposits._sum.amount ?? 0);

      res.json({
        period,
        range: {
          currentStart: currentStart.toISOString(),
          currentEnd: currentEnd.toISOString(),
          previousStart: previousStart.toISOString(),
          previousEnd: previousEnd.toISOString(),
        },
        summary: {
          revenue: { current: currentRevenue.toString(), previous: previousRevenue.toString(), changePercent: changePercent(currentRevenue, previousRevenue) },
          profit: { current: currentProfit.toString(), previous: previousProfit.toString(), changePercent: changePercent(currentProfit, previousProfit) },
          orders: { current: currentOrders._count, previous: previousOrders._count, changePercent: changePercent(currentOrders._count, previousOrders._count) },
          newUsers: { current: currentUsers, previous: previousUsers, changePercent: changePercent(currentUsers, previousUsers) },
          deposits: { current: currentDepositValue.toString(), previous: previousDepositValue.toString(), changePercent: changePercent(currentDepositValue, previousDepositValue) },
        },
        series: Array.from(seriesMap.values()),
      });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get(
  '/pricing',
  requireRole(UserRole.ADMIN),
  validate(listPricingServicesSchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const overrideRaw = req.query.overrideOnly;
      const activeRaw = req.query.active;
      const overrideOnly = overrideRaw === 'true';
      const hasActiveFilter = activeRaw === 'true' || activeRaw === 'false';
      const active = activeRaw === 'true';
      const offset = (page - 1) * limit;
      const where: Prisma.ServiceWhereInput = {
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { providerServiceId: { contains: search, mode: 'insensitive' as const } },
          ],
        }),
        ...(category && { category: { contains: category, mode: 'insensitive' as const } }),
        ...(overrideOnly && { isMarginOverride: true }),
        ...(hasActiveFilter && { isActive: active }),
      };

      const [globalDefaultMargin, services, total] = await Promise.all([
        getDefaultProfitMargin(),
        prisma.service.findMany({
          where,
          select: {
            id: true,
            providerServiceId: true,
            name: true,
            category: true,
            originalPrice: true,
            sellingPrice: true,
            profitMargin: true,
            isMarginOverride: true,
            minQuantity: true,
            maxQuantity: true,
            isActive: true,
            updatedAt: true,
          },
          orderBy: [{ isMarginOverride: 'desc' }, { updatedAt: 'desc' }],
          skip: offset,
          take: limit,
        }),
        prisma.service.count({ where }),
      ]);

      res.json({
        globalDefaultMargin: globalDefaultMargin.toString(),
        data: services.map((service) => ({
          ...service,
          originalPrice: service.originalPrice.toString(),
          sellingPrice: service.sellingPrice.toString(),
          profitMargin: service.profitMargin.toString(),
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.patch(
  '/pricing/default',
  requireRole(UserRole.ADMIN),
  validate(updateMarginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const margin = new Prisma.Decimal((req.body as { margin: number }).margin);
      const previousMargin = await getDefaultProfitMargin();
      await setDefaultProfitMargin(margin);

      const services = await prisma.service.findMany({
        where: { isMarginOverride: false },
        select: { id: true, originalPrice: true },
      });

      await prisma.$transaction(
        services.map((service) => prisma.service.update({
          where: { id: service.id },
          data: {
            profitMargin: margin,
            sellingPrice: calculateSellingPrice(service.originalPrice, margin),
          },
        })),
      );

      await createAuditLog({
        actorId: req.user!.id,
        action: 'UPDATE_GLOBAL_MARGIN',
        entity: 'Pricing',
        oldData: { margin: previousMargin.toString() },
        newData: { margin: margin.toString(), affectedServices: services.length },
        ipAddress: getRequestIp(req),
      });

      res.json({ message: 'Default profit margin updated successfully', margin: margin.toString(), affectedServices: services.length });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.patch(
  '/services/:id/pricing',
  requireRole(UserRole.ADMIN),
  validate(updateMarginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const serviceId = String(req.params.id);
      const margin = new Prisma.Decimal((req.body as { margin: number }).margin);
      const service = await prisma.service.findUnique({ where: { id: serviceId } });
      if (!service) {
        res.status(404).json({ error: 'Service not found' });
        return;
      }

      const updated = await prisma.service.update({
        where: { id: serviceId },
        data: {
          profitMargin: margin,
          sellingPrice: calculateSellingPrice(service.originalPrice, margin),
          isMarginOverride: true,
        },
        select: {
          id: true,
          name: true,
          originalPrice: true,
          sellingPrice: true,
          profitMargin: true,
          isMarginOverride: true,
        },
      });

      await createAuditLog({
        actorId: req.user!.id,
        action: 'UPDATE_SERVICE_MARGIN',
        entity: 'Service',
        oldData: { serviceId, margin: service.profitMargin.toString(), sellingPrice: service.sellingPrice.toString() },
        newData: { serviceId, margin: updated.profitMargin.toString(), sellingPrice: updated.sellingPrice.toString() },
        ipAddress: getRequestIp(req),
      });

      res.json({
        message: 'Service margin override updated successfully',
        service: {
          ...updated,
          originalPrice: updated.originalPrice.toString(),
          sellingPrice: updated.sellingPrice.toString(),
          profitMargin: updated.profitMargin.toString(),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.post(
  '/services/:id/pricing/reset',
  requireRole(UserRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const serviceId = String(req.params.id);
      const service = await prisma.service.findUnique({ where: { id: serviceId } });
      if (!service) {
        res.status(404).json({ error: 'Service not found' });
        return;
      }

      const margin = await getDefaultProfitMargin();
      const updated = await prisma.service.update({
        where: { id: serviceId },
        data: {
          profitMargin: margin,
          sellingPrice: calculateSellingPrice(service.originalPrice, margin),
          isMarginOverride: false,
        },
        select: {
          id: true,
          name: true,
          originalPrice: true,
          sellingPrice: true,
          profitMargin: true,
          isMarginOverride: true,
        },
      });

      await createAuditLog({
        actorId: req.user!.id,
        action: 'RESET_SERVICE_MARGIN',
        entity: 'Service',
        oldData: { serviceId, margin: service.profitMargin.toString(), sellingPrice: service.sellingPrice.toString(), isMarginOverride: service.isMarginOverride },
        newData: { serviceId, margin: updated.profitMargin.toString(), sellingPrice: updated.sellingPrice.toString(), isMarginOverride: false },
        ipAddress: getRequestIp(req),
      });

      res.json({
        message: 'Service margin reset to global default successfully',
        service: {
          ...updated,
          originalPrice: updated.originalPrice.toString(),
          sellingPrice: updated.sellingPrice.toString(),
          profitMargin: updated.profitMargin.toString(),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.delete(
  '/users/:id',
  requireRole(UserRole.SUPER_ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetUserId = String(req.params.id);

      if (targetUserId === req.user!.id) {
        res.status(403).json({ error: 'You cannot delete your own account' });
        return;
      }

      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, email: true, username: true, role: true, status: true },
      });

      if (!targetUser) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (targetUser.role === UserRole.SUPER_ADMIN) {
        res.status(403).json({ error: 'Super admin accounts cannot be deleted' });
        return;
      }

      const suffix = targetUserId.replace(/-/g, '').slice(0, 18);
      const deletedEmail = `deleted-${suffix}@deleted.3flames.local`;
      const deletedUsername = `deleted_${suffix}`;

      const [updated] = await prisma.$transaction([
        prisma.user.update({
          where: { id: targetUserId },
          data: {
            email: deletedEmail,
            username: deletedUsername,
            status: UserStatus.BANNED,
            isEmailVerified: false,
            otpCode: null,
            otpExpiresAt: null,
          },
          select: { id: true, username: true, email: true, status: true },
        }),
        prisma.auditLog.create({
          data: {
            actorId: req.user!.id,
            targetId: targetUserId,
            action: 'DELETE_USER',
            entity: 'User',
            oldData: {
              email: targetUser.email,
              username: targetUser.username,
              role: targetUser.role,
              status: targetUser.status,
            },
            newData: {
              email: deletedEmail,
              username: deletedUsername,
              status: UserStatus.BANNED,
              anonymized: true,
            },
            ipAddress: getRequestIp(req),
          },
        }),
      ]);

      logger.warn('User soft-deleted by super admin', {
        adminId: req.user!.id,
        targetUserId,
        previousUsername: targetUser.username,
      });

      res.json({ message: 'User deleted successfully', user: updated });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.post(
  '/users/:id/suspend',
  requireRole(UserRole.ADMIN),
  validate(suspendUserSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetUserId = String(req.params.id);
      const { reason } = req.body as { reason: string };

      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, username: true, status: true, role: true },
      });

      if (!targetUser) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (!canManageRole(req.user!.role, targetUser.role)) {
        res.status(403).json({ error: 'You do not have permission to suspend this account' });
        return;
      }

      if (targetUser.status === UserStatus.SUSPENDED) {
        res.status(409).json({ error: 'User is already suspended' });
        return;
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id: targetUserId },
          data: { status: UserStatus.SUSPENDED },
        }),
        prisma.auditLog.create({
          data: {
            actorId: req.user!.id,
            targetId: targetUserId,
            action: 'SUSPEND_USER',
            entity: 'User',
            oldData: { status: targetUser.status },
            newData: { status: UserStatus.SUSPENDED, reason },
            ipAddress: getRequestIp(req),
          },
        }),
      ]);

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

adminRouter.post(
  '/users/:id/unsuspend',
  requireRole(UserRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetUserId = String(req.params.id);

      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, username: true, status: true, role: true },
      });

      if (!targetUser) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (!canManageRole(req.user!.role, targetUser.role)) {
        res.status(403).json({ error: 'You do not have permission to reactivate this account' });
        return;
      }

      if (targetUser.status !== UserStatus.SUSPENDED) {
        res.status(409).json({ error: 'User is not currently suspended' });
        return;
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id: targetUserId },
          data: { status: UserStatus.ACTIVE },
        }),
        prisma.auditLog.create({
          data: {
            actorId: req.user!.id,
            targetId: targetUserId,
            action: 'UNSUSPEND_USER',
            entity: 'User',
            oldData: { status: targetUser.status },
            newData: { status: UserStatus.ACTIVE },
            ipAddress: getRequestIp(req),
          },
        }),
      ]);

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

adminRouter.post(
  '/users/:id/role',
  requireRole(UserRole.ADMIN),
  validate(updateUserRoleSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetUserId = String(req.params.id);
      const { role } = req.body as { role: UserRole };

      if (!canAssignRole(req.user!.role, role)) {
        res.status(403).json({ error: 'You do not have permission to assign this role' });
        return;
      }

      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, username: true, role: true },
      });

      if (!targetUser) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (!canManageRole(req.user!.role, targetUser.role)) {
        res.status(403).json({ error: 'You do not have permission to change this role' });
        return;
      }

      if (targetUser.role === role) {
        res.status(409).json({ error: 'User already has this role' });
        return;
      }

      const [updated] = await prisma.$transaction([
        prisma.user.update({
          where: { id: targetUserId },
          data: { role },
          select: { id: true, username: true, role: true },
        }),
        prisma.auditLog.create({
          data: {
            actorId: req.user!.id,
            targetId: targetUserId,
            action: 'UPDATE_ROLE',
            entity: 'User',
            oldData: { role: targetUser.role },
            newData: { role },
            ipAddress: getRequestIp(req),
          },
        }),
      ]);

      logger.info('User role changed by staff', {
        actorId: req.user!.id,
        targetUserId,
        oldRole: targetUser.role,
        newRole: role,
      });

      res.json({ message: 'User role updated successfully', user: updated });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get('/circuit-breaker', requireRole(UserRole.ADMIN), async (_req: Request, res: Response) => {
  const status = await circuitBreaker.getStatus();
  res.json(status);
});

adminRouter.post(
  '/circuit-breaker/reset',
  requireRole(UserRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await circuitBreaker.reset();
      await createAuditLog({
        actorId: req.user!.id,
        action: 'RESET_CIRCUIT_BREAKER',
        entity: 'CircuitBreaker',
        newData: { reset: true },
        ipAddress: getRequestIp(req),
      });

      logger.info('Circuit breaker manually reset by admin', {
        adminId: req.user!.id,
      });

      res.json({ message: 'Circuit breaker reset — order intake re-enabled' });
    } catch (error) {
      next(error);
    }
  },
);
