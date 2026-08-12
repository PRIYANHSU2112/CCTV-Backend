import { createApp } from './app.js';
import { env } from './config/env.config.js';
import { connectDatabase, disconnectDatabase } from './config/database.config.js';
import { logger } from './shared/utils/logger.js';
import { initScheduledTasks } from './scheduler/scheduled-tasks.js';

const startServer = async () => {
  // Connect MongoDB database
  await connectDatabase();

  // Initialize cron jobs
  initScheduledTasks();

  const { app, redisClient } = await createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(`==================================================`);
    logger.info(`🚀 Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
    logger.info(`📑 Swagger Docs (Auto-Loaded) available at http://localhost:${env.PORT}/api-docs`);
    logger.info(`==================================================`);
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received. Initiating graceful shutdown...`);

    server.close(async () => {
      logger.info('HTTP server closed successfully.');

      try {
        await disconnectDatabase();
        if (redisClient) {
          await redisClient.quit();
          logger.info('Redis connection closed gracefully.');
        }
      } catch (err) {
        logger.error(`Error during shutdown cleanup: ${err.message}`);
      }

      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown timeout reached. Exiting immediately.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ msg: 'Unhandled Promise Rejection', reason });
  });

  process.on('uncaughtException', (err) => {
    logger.error({ msg: 'Uncaught Exception thrown', err: err.message, stack: err.stack });
    process.exit(1);
  });
};

startServer();
