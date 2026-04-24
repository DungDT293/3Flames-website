import { Router, Request, Response } from 'express';
import { prisma } from '../../../shared/infrastructure/database';

export const serviceRouter = Router();

// GET /api/v1/services
serviceRouter.get('/', async (_req: Request, res: Response) => {
  const services = await prisma.service.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      category: true,
      description: true,
      sellingPrice: true,        // exposed to clients
      // originalPrice OMITTED — never leaked to clients
      minQuantity: true,
      maxQuantity: true,
      type: true,
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });

  // Group by category for easier frontend consumption
  const grouped: Record<string, typeof services> = {};
  for (const svc of services) {
    if (!grouped[svc.category]) {
      grouped[svc.category] = [];
    }
    grouped[svc.category].push(svc);
  }

  res.json({
    count: services.length,
    categories: Object.keys(grouped).length,
    services: grouped,
  });
});
