import { Router, Request, Response } from 'express';
import { prisma } from '../../../shared/infrastructure/database';

export const userRouter = Router();

// GET /api/v1/users/me
userRouter.get('/me', async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      email: true,
      username: true,
      balance: true,
      apiKey: true,
      role: true,
      status: true,
      createdAt: true,
      _count: { select: { orders: true } },
    },
  });

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const { _count, ...profile } = user;

  res.json({
    ...profile,
    balance: user.balance.toString(),
    totalOrders: _count.orders,
  });
});

// GET /api/v1/users/me/transactions
userRouter.get('/me/transactions', async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId: req.user!.id },
      select: {
        id: true,
        type: true,
        amount: true,
        balanceAfter: true,
        orderId: true,
        description: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.transaction.count({ where: { userId: req.user!.id } }),
  ]);

  res.json({
    data: transactions.map((t) => ({
      ...t,
      amount: t.amount.toString(),
      balanceAfter: t.balanceAfter.toString(),
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});
