import { logger } from '../utils/logger.js';
import { RequestContextService } from '../context/request-context.service.js';

export const errorLoggerMiddleware = (err, req, res, next) => {
  logger.error({
    msg: `Unhandled Middleware Exception: ${err.message}`,
    requestId: RequestContextService.requestId,
    correlationId: RequestContextService.correlationId,
    stack: err.stack
  });
  next(err);
};
