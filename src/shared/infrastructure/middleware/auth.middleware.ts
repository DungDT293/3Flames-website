import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../../config';
import { prisma } from '../../../shared/infrastructure/database';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Support both Bearer token and API key auth
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'] as string | undefined;

  if (apiKey) {
    const user = await prisma.user.findUnique({
      where: { apiKey },
      select: { id: true, email: true, username: true, role: true, status: true },
    });

    if (!user) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    if (user.status !== 'ACTIVE') {
      res.status(403).json({ error: 'Account suspended' });
      return;
    }

    req.user = user;
    next();
    return;
  }

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

export function adminOnly(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}
