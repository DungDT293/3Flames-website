import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../../../shared/infrastructure/database';
import { validate } from '../../../shared/infrastructure/middleware/validate.middleware';
import { updateProfileSchema, changePasswordSchema } from './schemas/user.schema';

const SALT_ROUNDS = 12;

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

// PATCH /api/v1/users/me
userRouter.patch(
  '/me',
  validate(updateProfileSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, username } = req.body as { email: string; username: string };

      const existing = await prisma.user.findFirst({
        where: {
          id: { not: req.user!.id },
          OR: [{ email }, { username }],
        },
        select: { email: true, username: true },
      });

      if (existing) {
        const field = existing.email === email ? 'email' : 'username';
        res.status(409).json({ error: `A user with this ${field} already exists`, field });
        return;
      }

      const user = await prisma.user.update({
        where: { id: req.user!.id },
        data: { email, username },
        select: { id: true, email: true, username: true, role: true, status: true, balance: true },
      });

      res.json({
        ...user,
        balance: user.balance.toString(),
      });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/v1/users/me/change-password
userRouter.post(
  '/me/change-password',
  validate(changePasswordSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { currentPassword, newPassword } = req.body as {
        currentPassword: string;
        newPassword: string;
      };

      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { id: true, passwordHash: true },
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) {
        res.status(400).json({ error: 'Current password is incorrect', field: 'currentPassword' });
        return;
      }

      const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
      await prisma.user.update({
        where: { id: req.user!.id },
        data: { passwordHash },
      });

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      next(error);
    }
  },
);


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
