import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../../../shared/infrastructure/middleware/validate.middleware';
import { authLimiter } from '../../../shared/infrastructure/middleware/rate-limit.middleware';
import { registerSchema, loginSchema } from './schemas/auth.schema';
import {
  AuthService,
  DuplicateFieldError,
  InvalidCredentialsError,
  AccountSuspendedError,
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
        message: 'Registration successful',
        user: result.user,
        token: result.token,
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
      next(error);
    }
  },
);
