import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { prisma } from '../../../shared/infrastructure/database';
import { redis } from '../../../shared/infrastructure/redis';
import { config } from '../../../config';
import { OtpEmailDeliveryError, sendOtpEmail } from '../../../shared/infrastructure/email.service';
import { logger } from '../../../shared/infrastructure/logger';

const SALT_ROUNDS = 12;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function generateOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  const visible = local.length <= 2 ? local[0] : local.slice(0, 2);
  return `${visible}***@${domain}`;
}

function maskPhone(phone: string): string {
  return phone.length <= 4 ? '***' : `${phone.slice(0, 2)}***${phone.slice(-2)}`;
}

const OTP_SEND_LIMIT = 3;
const OTP_SEND_WINDOW_S = 10 * 60; // same as OTP TTL

async function checkOtpSendLimit(email: string): Promise<void> {
  const key = `3f:otp:send:${email}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, OTP_SEND_WINDOW_S);
  if (count > OTP_SEND_LIMIT) throw new OtpSendLimitError();
}

async function clearOtpSendLimit(email: string): Promise<void> {
  await redis.del(`3f:otp:send:${email}`);
}

async function checkOtpAttempts(email: string): Promise<void> {
  const key = `3f:otp:attempts:${email}`;
  const attempts = await redis.incr(key);
  if (attempts === 1) await redis.expire(key, Math.ceil(OTP_TTL_MS / 1000));
  if (attempts > OTP_MAX_ATTEMPTS) throw new OtpRateLimitError();
}

async function clearOtpAttempts(email: string): Promise<void> {
  await redis.del(`3f:otp:attempts:${email}`);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export class AuthService {
  async register(email: string, username: string, password: string, phone?: string) {
    await checkOtpSendLimit(email);
    const normalizedUsername = username.trim().toLowerCase();
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { username: { equals: normalizedUsername, mode: 'insensitive' } },
          ...(phone ? [{ phone }] : []),
        ],
      },
      select: { email: true, username: true, phone: true },
    });

    if (existing) {
      const field = existing.email === email ? 'email' : existing.phone === phone ? 'phone' : 'username';
      throw new DuplicateFieldError(field);
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const otpCode = generateOtp();
    const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);

    const user = await prisma.user.create({
      data: {
        email,
        username: normalizedUsername,
        phone,
        passwordHash,
        acceptedTosVersion: config.tos.currentVersion,
        isEmailVerified: false,
        otpCode,
        otpExpiresAt,
      },
      select: { id: true, email: true, username: true, phone: true, createdAt: true },
    });

    let devOtp: string | undefined;

    try {
      await sendOtpEmail(user.email, otpCode);
    } catch (error) {
      if (config.env !== 'development') {
        await prisma.user.delete({ where: { id: user.id } });
        throw error;
      }

      devOtp = otpCode;
      logger.warn('Development OTP email fallback active', {
        email: user.email,
        otp: otpCode,
        reason: error instanceof Error ? error.message : 'Unknown email delivery error',
      });
    }

    return { success: true, requiresOtp: true, email: user.email, devOtp };
  }

  async verifyEmail(email: string, otp: string) {
    await checkOtpAttempts(email);

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
        phone: true,
      },
    });

    const otpValid = user?.otpCode && timingSafeEqual(user.otpCode, otp);

    if (!user || !otpValid || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
      throw new InvalidOtpError();
    }

    if (user.status !== 'ACTIVE') {
      throw new AccountSuspendedError();
    }

    await clearOtpAttempts(email);

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        otpCode: null,
        otpExpiresAt: null,
      },
      select: { id: true, email: true, username: true, phone: true, role: true },
    });

    const token = this.signToken(updated.id, updated.email);
    return { user: updated, token };
  }

  async lookupAccount(identifier: string) {
    const search = identifier.trim().toLowerCase();
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: search },
          { username: { equals: search, mode: 'insensitive' } },
          { phone: search },
        ],
      },
      select: { email: true, username: true, phone: true, status: true, isEmailVerified: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new InvalidCredentialsError();
    }

    return {
      email: maskEmail(user.email),
      username: user.username,
      phone: user.phone ? maskPhone(user.phone) : undefined,
      isEmailVerified: user.isEmailVerified,
    };
  }

  async resendOtp(email: string) {
    await checkOtpSendLimit(email);

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

    let devOtp: string | undefined;

    try {
      await sendOtpEmail(user.email, otpCode);
    } catch (error) {
      if (config.env !== 'development') {
        throw error;
      }

      devOtp = otpCode;
      logger.warn('Development OTP email fallback active', {
        email: user.email,
        otp: otpCode,
        reason: error instanceof Error ? error.message : 'Unknown email delivery error',
      });
    }

    return { success: true, requiresOtp: true, email: user.email, devOtp };
  }

  async forgotPassword(email: string) {
    await checkOtpSendLimit(email);
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, status: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new InvalidCredentialsError();
    }

    const otpCode = generateOtp();
    const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);

    await prisma.user.update({
      where: { id: user.id },
      data: { otpCode, otpExpiresAt },
    });

    let devOtp: string | undefined;

    try {
      await sendOtpEmail(user.email, otpCode);
    } catch (error) {
      if (config.env !== 'development') {
        throw error;
      }

      devOtp = otpCode;
      logger.warn('Development password reset OTP fallback active', {
        email: user.email,
        otp: otpCode,
        reason: error instanceof Error ? error.message : 'Unknown email delivery error',
      });
    }

    return { success: true, email: user.email, devOtp };
  }

  async resetPassword(email: string, otp: string, password: string) {
    await checkOtpAttempts(email);

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, status: true, otpCode: true, otpExpiresAt: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new InvalidCredentialsError();
    }

    const otpValid = user.otpCode && timingSafeEqual(user.otpCode, otp);

    if (!otpValid || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
      throw new InvalidOtpError();
    }

    await clearOtpAttempts(email);

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, otpCode: null, otpExpiresAt: null },
    });

    return { success: true, email: user.email };
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
        phone: true,
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
        phone: user.phone,
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

export class OtpRateLimitError extends Error {
  constructor() {
    super('Quá nhiều lần thử sai mã OTP. Vui lòng yêu cầu mã mới.');
    this.name = 'OtpRateLimitError';
  }
}

export class OtpSendLimitError extends Error {
  constructor() {
    super('Đã gửi quá nhiều mã OTP. Vui lòng thử lại sau 10 phút.');
    this.name = 'OtpSendLimitError';
  }
}
