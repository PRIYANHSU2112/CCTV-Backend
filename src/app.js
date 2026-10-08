import express from 'express';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import hpp from 'hpp';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.config.js';
import { createRedisClient } from './config/redis.config.js';
import { swaggerRegistry } from './config/swagger.config.js';
import { loadModuleSwaggerDocs } from './config/swagger.loader.js';
import { requestContextMiddleware } from './shared/context/request-context.middleware.js';
import { requestLoggerMiddleware } from './shared/middlewares/request-logger.middleware.js';
import { globalErrorHandler } from './shared/errors/global-error.handler.js';
import { createRateLimiter } from './shared/middlewares/rate-limiter.middleware.js';
import { RedisService } from './shared/services/redis.service.js';
import { HashService } from './shared/security/hash.service.js';
import { PostPaymentQueueService } from './shared/queues/post-payment-queue.service.js';
import { NotFoundError } from './shared/errors/not-found.error.js';

// Module Barrels (DI Initializers)
import { initHealthModule } from './modules/health/index.js';
import { initUserModule } from './modules/user/index.js';
import { initSubscriptionModule } from './modules/subscription/index.js';
import { initClientModule } from './modules/client/index.js';
import { initPaymentModule } from './modules/payment/index.js';
import { initInvoiceModule } from './modules/invoice/index.js';
import { initReminderModule } from './modules/reminder/index.js';
import { initReminderLifecycleCron } from './scheduler/scheduled-tasks.js';
import { initRbacModule, RbacService } from './modules/rbac/index.js';
import { initCompanyModule } from './modules/company/index.js';
import { initNotificationModule } from './modules/notification/index.js';
import { initDashboardModule } from './modules/dashboard/index.js';
import { initSearchModule } from './modules/search/index.js';
import { initReportModule } from './modules/report/index.js';

export const createApp = async () => {
  const app = express();
  app.disable('etag');

  // 1. Request Context (AsyncLocalStorage) & High-Performance Pino Logging
  app.use(requestContextMiddleware);
  app.use(requestLoggerMiddleware);

  // 2. Production Security Controls
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    }),
  );

  const rawOrigins = typeof env.CORS_ORIGIN === 'string' ? env.CORS_ORIGIN : '*';
  const allowedOrigins = rawOrigins.split(',').map((o) => o.trim()).filter(Boolean);

  const corsOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);

      // If '*' wildcard is in allowed origins, reflect the origin to satisfy credentials: true
      if (allowedOrigins.includes('*')) {
        return callback(null, true);
      }

      // Check explicitly listed origins
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Check saburisecurity.in and any subdomain (e.g. admin.saburisecurity.in)
      if (/^https?:\/\/([a-z0-9-]+\.)*saburisecurity\.in(:[0-9]+)?$/i.test(origin)) {
        return callback(null, true);
      }

      // Check localhost and 127.0.0.1 for local development across all ports
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:[0-9]+)?$/i.test(origin)) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'x-request-id',
      'x-correlation-id',
    ],
    exposedHeaders: ['x-request-id', 'x-correlation-id', 'Content-Range'],
    optionsSuccessStatus: 200,
  };

  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
  app.use(hpp());
  app.use(
    express.json({
      limit: '10mb',
      verify: (req, _res, buf) => {
        if (req.originalUrl?.includes('/payments/webhooks/razorpay')) {
          req.rawBody = buf;
        }
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Global Rate Limiting
  app.use(env.API_PREFIX, createRateLimiter());

  // 3. Shared Infrastructure Services
  const redisClient = createRedisClient();
  const redisService = new RedisService({ redisClient });
  const hashService = new HashService();
  const postPaymentQueueService = new PostPaymentQueueService({ redisClient });

  // 4. Initialize Domain Modules (Module-Scoped DI)
  const healthModule = initHealthModule({ redisService });
  const userModule = initUserModule({ redisService, hashService });
  const subscriptionModule = initSubscriptionModule({ redisService });

  // Client Module uses root DI container
  const clientModuleContainer = userModule.container;
  clientModuleContainer.register({
    subscriptionRepository: { resolve: () => subscriptionModule.container.resolve('subscriptionRepository') }
  });
  const clientModuleRouter = initClientModule(clientModuleContainer);

  const invoiceModule = initInvoiceModule({
    redisClient,
    clientRepository: clientModuleContainer.resolve('clientRepository')
  });

  const pdfQueueService = (invoiceModule.container.hasRegistration?.('pdfQueueService') || invoiceModule.container.registrations?.pdfQueueService)
    ? invoiceModule.container.resolve('pdfQueueService')
    : null;

  const paymentModule = initPaymentModule({
    redisService,
    clientRepository: clientModuleContainer.resolve('clientRepository'),
    subscriptionRepository: subscriptionModule.container.resolve('subscriptionRepository'),
    userRepository: clientModuleContainer.resolve('userRepository'),
    hashService,
    postPaymentQueueService,
    pdfQueueService,
  });

  // In single-node / development setups, ensure post-payment workers process queue jobs
  if (redisClient && process.env.START_EMBEDDED_WORKER !== 'false' && process.env.NODE_ENV !== 'test') {
    try {
      const { PostPaymentWorkers } = await import('./shared/queues/post-payment.workers.js');
      new PostPaymentWorkers({ redisClient, pdfQueueService });
    } catch {
      // safe fallback
    }
  }

  const reminderModule = initReminderModule({
    redisClient,
    clientRepository: clientModuleContainer.resolve('clientRepository')
  });

  // Initialize automated 09:00 AM IST reminder lifecycle cron
  initReminderLifecycleCron(reminderModule.container.resolve('reminderService'));

  const rbacModule = initRbacModule();
  await RbacService.seedDefaultRoles();

  const companyModule = initCompanyModule({ redisService });

  const notificationModule = initNotificationModule();

  const dashboardModule = initDashboardModule({ redisService });

  const reportModule = initReportModule({ redisService });

  const searchModule = initSearchModule({ redisService });

  // 5. Automatically Discover & Auto-Load All Module Swagger Spec Files
  await loadModuleSwaggerDocs();

  // Serve Main Aggregated Swagger UI (All Modules Combined)
  app.use('/api-docs', swaggerUi.serve);
  app.get('/api-docs', (req, res, next) => {
    const combinedSpec = swaggerRegistry.getCombinedSwaggerSpec();
    swaggerUi.setup(combinedSpec)(req, res, next);
  });

  // Serve Per-Module Swagger UI (Dedicated Documentation Per Module)
  app.get('/api-docs/:moduleName', (req, res, next) => {
    const moduleSpec = swaggerRegistry.getModuleSwaggerSpec(req.params.moduleName);
    if (!moduleSpec) {
      return next(new NotFoundError(`Swagger documentation for module '${req.params.moduleName}' not found`));
    }
    swaggerUi.setup(moduleSpec)(req, res, next);
  });

  // Serve static generated uploads (Invoices, PDFs)
  app.use('/uploads', express.static(path.resolve('uploads')));

  // 6. Mount Domain Module Routers
  app.use(`${env.API_PREFIX}`, healthModule.router);
  app.use(`${env.API_PREFIX}/dashboard`, dashboardModule.router);
  app.use(`${env.API_PREFIX}/reports`, reportModule.router);
  app.use(`${env.API_PREFIX}/search`, searchModule.router);
  app.use(`${env.API_PREFIX}/users`, userModule.router);
  app.use(`${env.API_PREFIX}/rbac`, rbacModule.router);
  app.use(`${env.API_PREFIX}/company`, companyModule.router);
  app.use(`${env.API_PREFIX}/subscriptions`, subscriptionModule.router);
  app.use(`${env.API_PREFIX}/clients`, clientModuleRouter);
  app.use(`${env.API_PREFIX}/payments`, paymentModule.router);
  app.use(`${env.API_PREFIX}/invoices`, invoiceModule.router);
  app.use(`${env.API_PREFIX}/reminders`, reminderModule.router);
  app.use(`${env.API_PREFIX}/notifications`, notificationModule.router);

  // 7. Handle Unmatched 404 Routes
  app.all('*', (req, res, next) => {
    next(new NotFoundError(`Cannot find route [${req.method}] ${req.originalUrl} on this server`));
  });

  // 8. Centralized Global Error Handler Middleware
  app.use(globalErrorHandler);

  return { app, redisClient };
};
