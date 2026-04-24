import { PrismaClient } from '@prisma/client';
import { config } from '../../config';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: config.env === 'development' ? ['query', 'warn', 'error'] : ['error'],
  });

if (config.env !== 'production') {
  globalForPrisma.prisma = prisma;
}
