import dotenv from 'dotenv';

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  database: {
    url: requireEnv('DATABASE_URL'),
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    tls: process.env.REDIS_TLS === 'true',
  },

  jwt: {
    secret: requireEnv('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  provider: {
    apiUrl: process.env.PROVIDER_API_URL || 'https://theytlab.com/api/v2',
    apiKey: process.env.PROVIDER_API_KEY || '',
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '3Flames <onboarding@resend.dev>',
  },

  r2: {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucketName: process.env.R2_BUCKET_NAME || '3flames-assets',
    publicUrl: process.env.R2_PUBLIC_URL || '',
  },

  pricing: {
    defaultProfitMargin: parseFloat(process.env.DEFAULT_PROFIT_MARGIN || '10'),
  },

  exchange: {
    usdVndFallback: parseFloat(process.env.USD_VND_FALLBACK || '25000'),
    cacheTtlMs: parseInt(process.env.EXCHANGE_RATE_CACHE_TTL_MS || '300000', 10),
    apiUrl: process.env.EXCHANGE_RATE_API_URL || 'https://open.er-api.com/v6/latest/USD',
  },

  webhook: {
    secret: requireEnv('WEBHOOK_SECRET'),
  },

  circuitBreaker: {
    failureThreshold: parseInt(process.env.CB_FAILURE_THRESHOLD || '5', 10),
    failureWindowMs: parseInt(process.env.CB_FAILURE_WINDOW_MS || '120000', 10), // 2 minutes
    cooldownMs: parseInt(process.env.CB_COOLDOWN_MS || '1800000', 10),           // 30 minutes
  },

  tos: {
    currentVersion: process.env.CURRENT_TOS_VERSION || '1.0',
  },

  vietqr: {
    bankBin: process.env.VIETQR_BANK_BIN || '',
    accountNumber: process.env.VIETQR_ACCOUNT_NUMBER || '',
  },
} as const;
