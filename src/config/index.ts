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
  },

  jwt: {
    secret: requireEnv('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  provider: {
    apiUrl: requireEnv('PROVIDER_API_URL'),
    apiKey: requireEnv('PROVIDER_API_KEY'),
  },

  r2: {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucketName: process.env.R2_BUCKET_NAME || '3flames-assets',
    publicUrl: process.env.R2_PUBLIC_URL || '',
  },

  pricing: {
    defaultProfitMargin: parseFloat(process.env.DEFAULT_PROFIT_MARGIN || '30'),
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
} as const;
