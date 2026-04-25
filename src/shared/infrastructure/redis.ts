import Redis from 'ioredis';
import { config } from '../../config';

export const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  tls: config.redis.tls ? {} : undefined,
  maxRetriesPerRequest: null,
  lazyConnect: true,
});
