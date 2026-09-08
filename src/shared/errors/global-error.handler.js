import { HttpStatus } from '../constants/http-status.constant.js';
import { env } from '../../config/env.config.js';
import { logger } from '../utils/logger.js';
import { RequestContextService } from '../context/request-context.service.js';

export const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
  err.status = err.status || 'error';

  if (!err.message) {
    err.message =
      err?.error?.description ||
      err?.error?.message ||
      (typeof err?.error === 'string' ? err.error : null) ||
      'An unexpected error occurred';
  }

  if (err.isJoi) {
    err.statusCode = HttpStatus.BAD_REQUEST;
    err.message = err.details ? err.details.map((d) => d.message).join(', ') : err.message;
  }

  // Mongoose schema validation (e.g. GSTIN format)
  if (err.name === 'ValidationError' && err.errors) {
    err.statusCode = HttpStatus.BAD_REQUEST;
    const details = Object.values(err.errors)
      .map((e) => e.message)
      .join('; ');
    err.message = details ? `Client validation failed: ${details}` : err.message;
  }

  if (err.name === 'CastError') {
    err.statusCode = HttpStatus.BAD_REQUEST;
    err.message = `Invalid ${err.path || 'id'}`;
  }

  const requestId = RequestContextService.requestId;
  const correlationId = RequestContextService.correlationId;

  logger.error({
    msg: `[${req.method}] ${req.originalUrl} - Error: ${err.message}`,
    statusCode: err.statusCode,
    requestId,
    correlationId,
    stack: err.stack
  });

  const responsePayload = {
    success: false,
    statusCode: err.statusCode,
    message: err.message || 'An unexpected error occurred',
    errors: err.errors || null,
    meta: {
      requestId,
      correlationId
    },
    ...(env.isDev && { stack: err.stack })
  };

  res.status(err.statusCode).json(responsePayload);
};
