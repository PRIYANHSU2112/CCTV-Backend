import { v4 as uuidv4 } from 'uuid';
import { RequestContextService } from './request-context.service.js';

export const requestContextMiddleware = (req, res, next) => {
  const store = new Map();

  const requestId = req.headers['x-request-id'] || uuidv4();
  const correlationId = req.headers['x-correlation-id'] || requestId;

  store.set('requestId', requestId);
  store.set('correlationId', correlationId);

  // Set response headers for client tracing
  res.setHeader('X-Request-ID', requestId);
  res.setHeader('X-Correlation-ID', correlationId);

  RequestContextService.run(store, () => {
    next();
  });
};


