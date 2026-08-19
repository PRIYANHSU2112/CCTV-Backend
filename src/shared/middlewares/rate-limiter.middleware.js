import rateLimit from 'express-rate-limit';
import { HttpStatus } from '../constants/http-status.constant.js';
import { Messages } from '../constants/messages.constant.js';
import { env } from '../../config/env.config.js';

export const createRateLimiter = (
  windowMs = env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000,
  max = env.RATE_LIMIT_MAX || (env.isDev ? 5000 : 1000)
) => {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      if (env.isTest) return true;
      if (req.path === '/health' || req.path?.startsWith('/health/')) return true;
      return false;
    },
    statusCode: HttpStatus.TOO_MANY_REQUESTS,
    message: {
      success: false,
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: Messages.TOO_MANY_REQUESTS
    }
  });
};
