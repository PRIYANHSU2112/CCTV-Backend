import { connectDatabase, disconnectDatabase } from './config/database.config.js';
import { createRedisClient } from './config/redis.config.js';
import { logger } from './shared/utils/logger.js';
import { initReminderModule } from './modules/reminder/index.js';
import { initInvoiceModule } from './modules/invoice/index.js';
import { initClientModule } from './modules/client/index.js';
import { initUserModule } from './modules/user/index.js';
import { HashService } from './shared/security/hash.service.js';
import { RedisService } from './shared/services/redis.service.js';
import { PostPaymentWorkers } from './shared/queues/post-payment.workers.js';
import { SubscriptionRepository } from './modules/subscription/subscription.repository.js';

const startWorker = async () => {
  logger.info('==================================================');
  logger.info('🚀 Starting Standalone Production Background Worker Process...');
  logger.info('==================================================');

  // Connect MongoDB
  await connectDatabase();

  // Connect Redis
  const redisClient = createRedisClient();
  const redisService = new RedisService({ redisClient });
  const hashService = new HashService();

  // Initialize DI Dependencies for Worker
  const userModule = initUserModule({ redisService, hashService });
  const clientModuleContainer = userModule.container;

  // Register SubscriptionRepository needed by ClientService
  const { asClass } = await import('awilix');
  clientModuleContainer.register({
    subscriptionRepository: asClass(SubscriptionRepository).singleton(),
  });

  initClientModule(clientModuleContainer);

  // Initialize Domain Modules (Boots BullMQ Workers & PDF Service)
  const invoiceModule = initInvoiceModule({
    redisClient,
    clientRepository: clientModuleContainer.resolve('clientRepository'),
    isWorker: true
  });

  const reminderModule = initReminderModule({
    redisClient,
    clientRepository: clientModuleContainer.resolve('clientRepository'),
    isWorker: true
  });

  const pdfQueueService = invoiceModule.container.resolve('pdfQueueService');
  const postPaymentWorkers = new PostPaymentWorkers({ redisClient, pdfQueueService });

  logger.info('✅ Production Worker active & listening for BullMQ background jobs...');

  const shutdown = async (signal) => {
    logger.info(`${signal} received. Initiating graceful worker shutdown...`);
    try {
      if (postPaymentWorkers) {
        await postPaymentWorkers.close();
      }
      if (reminderModule.container && reminderModule.container.has('reminderWorker')) {
        const reminderWorker = reminderModule.container.resolve('reminderWorker');
        await reminderWorker.close();
      }
      if (invoiceModule.container && invoiceModule.container.has('pdfWorker')) {
        const pdfWorker = invoiceModule.container.resolve('pdfWorker');
        await pdfWorker.close();
      }
      if (invoiceModule.container && invoiceModule.container.has('pdfService')) {
        const pdfService = invoiceModule.container.resolve('pdfService');
        await pdfService.destroy();
      }
      await disconnectDatabase();
      if (redisClient) {
        await redisClient.quit();
      }
      logger.info('Worker shutdown completed successfully.');
      process.exit(0);
    } catch (err) {
      logger.error(`Error during worker shutdown: ${err.message}`);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ msg: 'Unhandled Promise Rejection in Worker', reason });
  });

  process.on('uncaughtException', (err) => {
    logger.error({ msg: 'Uncaught Exception in Worker', err: err.message, stack: err.stack });
    process.exit(1);
  });
};

startWorker();
