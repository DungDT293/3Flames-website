import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../../config';
import { UserRole } from '@prisma/client';
import { prisma } from '../../../shared/infrastructure/database';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

const ROLE_RANK: Record<UserRole, number> = {
  [UserRole.USER]: 0,
  [UserRole.SUPPORT]: 1,
  [UserRole.ADMIN]: 2,
  [UserRole.SUPER_ADMIN]: 3,
};

export function getRoleRank(role: string): number {
  return ROLE_RANK[role as UserRole] ?? -1;
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  const token = authHeader.slice(7);

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, username: true, role: true, status: true },
  });

  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }

  if (user.status !== 'ACTIVE') {
    res.status(403).json({ error: 'Account suspended' });
    return;
  }

  req.user = user;
  next();
}

export function requireRole(minRole: UserRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || getRoleRank(req.user.role) < ROLE_RANK[minRole]) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

export const adminOnly = requireRole(UserRole.SUPPORT);
