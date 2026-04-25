import { prisma } from '../shared/infrastructure/database';
import { logger } from '../shared/infrastructure/logger';

export async function expireDeposits(): Promise<void> {
  const result = await prisma.depositRequest.updateMany({
    where: {
      status: 'PENDING',
      expiresAt: { lt: new Date() },
    },
    data: { status: 'EXPIRED' },
  });

  if (result.count > 0) {
    logger.info('Expired stale deposit requests', { count: result.count });
  }
}

if (require.main === module) {
  (async () => {
    logger.info('Expire Deposits Worker started');
    await expireDeposits();
    await prisma.$disconnect();
    process.exit(0);
  })().catch((err) => {
    logger.error('Expire Deposits Worker crashed', { error: err });
    process.exit(1);
  });
}
