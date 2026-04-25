import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@3flames.com' },
    update: { role: 'SUPER_ADMIN' },
    create: {
      email: 'admin@3flames.com',
      username: 'admin',
      passwordHash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      acceptedTosVersion: '1.0',
    },
  });

  console.log('Admin account created:', {
    email: admin.email,
    username: admin.username,
    role: admin.role,
    password: 'admin123',
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
