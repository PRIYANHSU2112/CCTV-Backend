import rateLimit from 'express-rate-limit';
import { HttpStatus } from '../constants/http-status.constant.js';
import { Messages } from '../constants/messages.constant.js';

export const createRateLimiter = (windowMs = 15 * 60 * 1000, max = 100) => {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: HttpStatus.TOO_MANY_REQUESTS,
    message: {
      success: false,
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: Messages.TOO_MANY_REQUESTS
    }
  });
};
