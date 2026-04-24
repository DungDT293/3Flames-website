import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../../../shared/infrastructure/database';
import { config } from '../../../config';

const SALT_ROUNDS = 12;

export class AuthService {
  async register(email: string, username: string, password: string) {
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });

    if (existing) {
      const field = existing.email === email ? 'email' : 'username';
      throw new DuplicateFieldError(field);
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const apiKey = crypto.randomBytes(32).toString('hex');

    const user = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
        apiKey,
        acceptedTosVersion: config.tos.currentVersion,
      },
      select: { id: true, email: true, username: true, apiKey: true, createdAt: true },
    });

    const token = this.signToken(user.id, user.email);

    return { user, token };
  }

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        username: true,
        passwordHash: true,
        status: true,
        role: true,
      },
    });

    if (!user) {
      throw new InvalidCredentialsError();
    }

    if (user.status !== 'ACTIVE') {
      throw new AccountSuspendedError();
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new InvalidCredentialsError();
    }

    const token = this.signToken(user.id, user.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
      token,
    };
  }

  private signToken(userId: string, email: string): string {
    return jwt.sign(
      { sub: userId, email, iss: '3flames' },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn as string },
    );
  }
}

export class DuplicateFieldError extends Error {
  constructor(public readonly field: string) {
    super(`A user with this ${field} already exists`);
    this.name = 'DuplicateFieldError';
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid email or password');
    this.name = 'InvalidCredentialsError';
  }
}

export class AccountSuspendedError extends Error {
  constructor() {
    super('Account is suspended');
    this.name = 'AccountSuspendedError';
  }
}
