import winston from 'winston';
import { config } from '../../config';

export const logger = winston.createLogger({
  level: config.env === 'development' ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    config.env === 'development'
      ? winston.format.combine(winston.format.colorize(), winston.format.simple())
      : winston.format.json(),
  ),
  defaultMeta: { service: '3flames' },
  transports: [new winston.transports.Console()],
});
