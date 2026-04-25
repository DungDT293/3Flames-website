import nodemailer from 'nodemailer';
import { config } from '../../config';
import { logger } from './logger';

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.port === 465,
  auth: config.smtp.user && config.smtp.pass ? {
    user: config.smtp.user,
    pass: config.smtp.pass,
  } : undefined,
});

export class OtpEmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OtpEmailDeliveryError';
  }
}

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    logger.warn('SMTP not configured; OTP email skipped', { to });
    return;
  }

  try {
    await transporter.sendMail({
      from: config.smtp.from,
      to,
      subject: 'Mã xác thực email 3Flames',
      text: `Mã xác thực 3Flames của bạn là ${otp}. Mã có hiệu lực trong 10 phút.`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
          <h2>Xác thực email 3Flames</h2>
          <p>Mã xác thực của bạn:</p>
          <p style="font-size:28px;font-weight:700;letter-spacing:6px">${otp}</p>
          <p>Mã có hiệu lực trong 10 phút. Nếu bạn không tạo tài khoản 3Flames, vui lòng bỏ qua email này.</p>
        </div>
      `,
    });
  } catch (error) {
    logger.error('OTP email delivery failed', { to, error });
    throw new OtpEmailDeliveryError('Không thể gửi mã xác thực tới email này. Vui lòng dùng email được cấu hình cho môi trường test hoặc liên hệ hỗ trợ.');
  }
}
