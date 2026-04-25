import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../../../shared/infrastructure/middleware/validate.middleware';
import { authLimiter } from '../../../shared/infrastructure/middleware/rate-limit.middleware';
import { registerSchema, loginSchema, verifyEmailSchema, resendOtpSchema } from './schemas/auth.schema';
import {
  AuthService,
  DuplicateFieldError,
  InvalidCredentialsError,
  AccountSuspendedError,
  EmailNotVerifiedError,
  InvalidOtpError,
} from '../application/auth.service';

const authService = new AuthService();

export const authRouter = Router();

// POST /api/v1/auth/register
authRouter.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, username, password } = req.body;
      const result = await authService.register(email, username, password);

      res.status(201).json({
        message: 'Vui lòng kiểm tra email để lấy mã xác thực',
        success: result.success,
        requiresOtp: result.requiresOtp,
        email: result.email,
      });
    } catch (error) {
      if (error instanceof DuplicateFieldError) {
        res.status(409).json({ error: error.message, field: error.field });
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
      });
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        res.status(404).json({ error: 'Email not found' });
        return;
      }
      next(error);
    }
  },
);
