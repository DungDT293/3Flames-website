import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../../../shared/infrastructure/middleware/validate.middleware';
import { authLimiter } from '../../../shared/infrastructure/middleware/rate-limit.middleware';
import { registerSchema, loginSchema, verifyEmailSchema, resendOtpSchema, lookupAccountSchema, forgotPasswordSchema, resetPasswordSchema } from './schemas/auth.schema';
import {
  AuthService,
  DuplicateFieldError,
  InvalidCredentialsError,
  AccountSuspendedError,
  EmailNotVerifiedError,
  InvalidOtpError,
  OtpRateLimitError,
  OtpSendLimitError,
} from '../application/auth.service';
import { OtpEmailDeliveryError } from '../../../shared/infrastructure/email.service';

const authService = new AuthService();

export const authRouter = Router();

// POST /api/v1/auth/register
authRouter.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, username, password, phone } = req.body;
      const result = await authService.register(email, username, password, phone);

      res.status(201).json({
        message: 'Vui lòng kiểm tra email để lấy mã xác thực',
        success: result.success,
        requiresOtp: result.requiresOtp,
        email: result.email,
        ...(process.env.NODE_ENV !== 'production' && result.devOtp ? { devOtp: result.devOtp } : {}),
      });
    } catch (error) {
      if (error instanceof OtpSendLimitError) {
        res.status(429).json({ error: error.message });
        return;
      }
      if (error instanceof DuplicateFieldError) {
        res.status(409).json({ error: error.message, field: error.field });
        return;
      }
      if (error instanceof OtpEmailDeliveryError) {
        res.status(502).json({ error: error.message, field: 'email' });
        return;
      }
      next(error);
    }
  },
);

// POST /api/v1/auth/lookup-account
authRouter.post(
  '/lookup-account',
  authLimiter,
  validate(lookupAccountSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { identifier } = req.body as { identifier: string };
      const account = await authService.lookupAccount(identifier);
      res.json({ account });
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        res.status(404).json({ error: 'Account not found' });
        return;
      }
      next(error);
    }
  },
);

// POST /api/v1/auth/forgot-password
authRouter.post(
  '/forgot-password',
  authLimiter,
  validate(forgotPasswordSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body as { email: string };
      const result = await authService.forgotPassword(email);
      res.json({ message: 'Mã đặt lại mật khẩu đã được gửi', success: result.success, email: result.email, ...(process.env.NODE_ENV !== 'production' && result.devOtp ? { devOtp: result.devOtp } : {}) });
    } catch (error) {
      if (error instanceof OtpSendLimitError) {
        res.status(429).json({ error: error.message });
        return;
      }
      if (error instanceof InvalidCredentialsError) {
        res.status(404).json({ error: 'Email not found' });
        return;
      }
      if (error instanceof OtpEmailDeliveryError) {
        res.status(502).json({ error: error.message, field: 'email' });
        return;
      }
      next(error);
    }
  },
);

// POST /api/v1/auth/reset-password
authRouter.post(
  '/reset-password',
  authLimiter,
  validate(resetPasswordSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, otp, password } = req.body as { email: string; otp: string; password: string };
      const result = await authService.resetPassword(email, otp, password);
      res.json({ message: 'Đổi mật khẩu thành công', success: result.success, email: result.email });
    } catch (error) {
      if (error instanceof OtpRateLimitError) {
        res.status(429).json({ error: error.message });
        return;
      }
      if (error instanceof InvalidCredentialsError) {
        res.status(404).json({ error: 'Email not found' });
        return;
      }
      if (error instanceof InvalidOtpError) {
        res.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  },
);

// POST /api/v1/auth/login
authRouter.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);

      res.json({
        message: 'Login successful',
        user: result.user,
        token: result.token,
      });
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        res.status(401).json({ error: error.message });
        return;
      }
      if (error instanceof AccountSuspendedError) {
        res.status(403).json({ error: error.message });
        return;
      }
      if (error instanceof EmailNotVerifiedError) {
        res.status(403).json({ error: error.message, requiresOtp: true, email: error.email });
        return;
      }
      next(error);
    }
  },
);

// POST /api/v1/auth/verify-email
authRouter.post(
  '/verify-email',
  authLimiter,
  validate(verifyEmailSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, otp } = req.body;
      const result = await authService.verifyEmail(email, otp);

      res.json({
        message: 'Email verified successfully',
        user: result.user,
        token: result.token,
      });
    } catch (error) {
      if (error instanceof OtpRateLimitError) {
        res.status(429).json({ error: error.message });
        return;
      }
      if (error instanceof InvalidOtpError) {
        res.status(400).json({ error: error.message });
        return;
      }
      if (error instanceof AccountSuspendedError) {
        res.status(403).json({ error: error.message });
        return;
      }
      next(error);
    }
  },
);

// POST /api/v1/auth/resend-otp
authRouter.post(
  '/resend-otp',
  authLimiter,
  validate(resendOtpSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body;
      const result = await authService.resendOtp(email);

      res.json({
        message: result.requiresOtp ? 'Mã xác thực mới đã được gửi' : 'Email đã được xác thực',
        success: result.success,
        requiresOtp: result.requiresOtp,
        email: result.email,
        ...(process.env.NODE_ENV !== 'production' && result.devOtp ? { devOtp: result.devOtp } : {}),
      });
    } catch (error) {
      if (error instanceof OtpSendLimitError) {
        res.status(429).json({ error: error.message });
        return;
      }
      if (error instanceof InvalidCredentialsError) {
        res.status(404).json({ error: 'Email not found' });
        return;
      }
      if (error instanceof OtpEmailDeliveryError) {
        res.status(502).json({ error: error.message, field: 'email' });
        return;
      }
      next(error);
    }
  },
);
