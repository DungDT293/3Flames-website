import { Router, Request, Response } from 'express';
import { prisma } from '../../../shared/infrastructure/database';

export const serviceRouter = Router();

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 100;

// GET /api/v1/services
serviceRouter.get('/', async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.limit as string) || DEFAULT_PAGE_SIZE));
  const skip = (page - 1) * limit;

  const [services, total] = await Promise.all([
    prisma.service.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        category: true,
        description: true,
        sellingPrice: true,
        minQuantity: true,
        maxQuantity: true,
        type: true,
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      skip,
      take: limit,
    }),
    prisma.service.count({ where: { isActive: true } }),
  ]);

  const grouped: Record<string, typeof services> = {};
  for (const svc of services) {
    if (!grouped[svc.category]) {
      grouped[svc.category] = [];
    }
    grouped[svc.category].push(svc);
  }

  res.json({
    count: services.length,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    categories: Object.keys(grouped).length,
    services: grouped,
  });
});
