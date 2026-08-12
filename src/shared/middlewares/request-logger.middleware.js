import pinoHttp from 'pino-http';
import { logger } from '../utils/logger.js';
import { RequestContextService } from '../context/request-context.service.js';

export const requestLoggerMiddleware = pinoHttp({
  logger,
  customProps: () => ({
    requestId: RequestContextService.requestId,
    correlationId: RequestContextService.correlationId
  }),
  customSuccessMessage: (req, res, responseTime) => {
    return `[${req.method}] ${req.url} ${res.statusCode} - ${responseTime}ms`;
  },
  customErrorMessage: (req, res, err) => {
    return `[${req.method}] ${req.url} ${res.statusCode} - Failed: ${err.message}`;
  }
});
