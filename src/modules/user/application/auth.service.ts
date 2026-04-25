import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { prisma } from '../../../shared/infrastructure/database';
import { config } from '../../../config';
import { sendOtpEmail } from '../../../shared/infrastructure/email.service';

const SALT_ROUNDS = 12;
const OTP_TTL_MS = 10 * 60 * 1000;

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

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
    const otpCode = generateOtp();
    const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);

    const user = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
        acceptedTosVersion: config.tos.currentVersion,
        isEmailVerified: false,
        otpCode,
        otpExpiresAt,
      },
      select: { id: true, email: true, username: true, createdAt: true },
    });

    try {
      await sendOtpEmail(user.email, otpCode);
    } catch (error) {
      await prisma.user.delete({ where: { id: user.id } });
      throw error;
    }

    return { success: true, requiresOtp: true, email: user.email };
  }

  async verifyEmail(email: string, otp: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        status: true,
        isEmailVerified: true,
        otpCode: true,
        otpExpiresAt: true,
      },
    });

    if (!user || user.otpCode !== otp || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
      throw new InvalidOtpError();
    }

    if (user.status !== 'ACTIVE') {
      throw new AccountSuspendedError();
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        otpCode: null,
        otpExpiresAt: null,
      },
      select: { id: true, email: true, username: true, role: true },
    });

    const token = this.signToken(updated.id, updated.email);
    return { user: updated, token };
  }

  async resendOtp(email: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, isEmailVerified: true },
    });

    if (!user) {
      throw new InvalidCredentialsError();
    }

    if (user.isEmailVerified) {
      return { success: true, requiresOtp: false, email: user.email };
    }

    const otpCode = generateOtp();
    const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);

    await prisma.user.update({
      where: { id: user.id },
      data: { otpCode, otpExpiresAt },
    });

    await sendOtpEmail(user.email, otpCode);
    return { success: true, requiresOtp: true, email: user.email };
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
        isEmailVerified: true,
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

    if (!user.isEmailVerified) {
      throw new EmailNotVerifiedError(user.email);
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
    const options: SignOptions = { expiresIn: config.jwt.expiresIn as SignOptions['expiresIn'] };

    return jwt.sign(
      { sub: userId, email, iss: '3flames' },
      config.jwt.secret,
      options,
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

export class EmailNotVerifiedError extends Error {
  constructor(public readonly email: string) {
    super('Vui lòng xác thực email trước khi đăng nhập');
    this.name = 'EmailNotVerifiedError';
  }
}

export class InvalidOtpError extends Error {
  constructor() {
    super('Mã xác thực không hợp lệ hoặc đã hết hạn');
    this.name = 'InvalidOtpError';
  }
}
