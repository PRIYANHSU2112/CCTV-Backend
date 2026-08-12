import pino from 'pino';
import { env } from './env.config.js';

export const logger = pino({
  level: env.LOG_LEVEL || (env.isDev ? 'debug' : 'info'),
  transport: env.isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname'
        }
      }
    : undefined,
  base: {
    env: env.NODE_ENV
  },
  timestamp: pino.stdTimeFunctions.isoTime
});
