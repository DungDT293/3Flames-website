import { Request, Response, NextFunction } from 'express';
import { prisma } from '../database';
import { config } from '../../../config';

// ─────────────────────────────────────────────────────────────
// TOS ENFORCEMENT MIDDLEWARE
//
// Blocks order placement if the user hasn't accepted the
// current Terms of Service version. When we bump
// CURRENT_TOS_VERSION in config, all existing users are
// gated until they re-accept — no code changes needed.
//
// HTTP 451: "Unavailable For Legal Reasons" (RFC 7725)
// ─────────────────────────────────────────────────────────────
export async function requireCurrentTos(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { acceptedTosVersion: true },
  });

  if (!user || user.acceptedTosVersion !== config.tos.currentVersion) {
    res.status(451).json({
      error: 'Terms of Service update required',
      message:
        'Our Terms of Service have been updated. You must accept the latest version ' +
        'before placing new orders. Please review and accept the updated terms in your account settings.',
      required_version: config.tos.currentVersion,
      accepted_version: user?.acceptedTosVersion || null,
    });
    return;
  }

  next();
}
