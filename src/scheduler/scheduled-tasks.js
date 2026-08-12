import { initCleanupJob } from './cleanup.job.js';
import { logger } from '../shared/utils/logger.js';

export const initScheduledTasks = () => {
  logger.info('Initializing background cron scheduler...');
  initCleanupJob();
  logger.info('All cron jobs scheduled successfully.');
};
