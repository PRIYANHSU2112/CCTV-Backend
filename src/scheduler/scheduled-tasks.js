import cron from 'node-cron';
import { initCleanupJob } from './cleanup.job.js';
import { logger } from '../shared/utils/logger.js';

let reminderServiceInstance = null;

export const setReminderService = (service) => {
  reminderServiceInstance = service;
};

export const initReminderLifecycleCron = (reminderService) => {
  if (reminderService) reminderServiceInstance = reminderService;

  // Run every day at 09:00 AM in Asia/Kolkata timezone (0 9 * * *)
  cron.schedule(
    '0 9 * * *',
    async () => {
      logger.info('⏰ [Cron 09:00 AM IST] Executing daily automated reminder lifecycle checks...');
      try {
        if (reminderServiceInstance?.processDailyLifecycleReminders) {
          const result = await reminderServiceInstance.processDailyLifecycleReminders();
          logger.info(`✅ [Cron 09:00 AM IST] Daily lifecycle complete: ${result.totalEnqueued} reminder(s) enqueued`);
        } else {
          logger.warn('⚠️ [Cron 09:00 AM IST] ReminderService instance not available for lifecycle execution');
        }
      } catch (err) {
        logger.error(`❌ [Cron 09:00 AM IST] Lifecycle cron execution failed: ${err.message}`);
      }
    },
    {
      timezone: 'Asia/Kolkata',
    }
  );

  logger.info('⏰ Reminder daily lifecycle cron registered (09:00 AM Asia/Kolkata)');
};

export const initScheduledTasks = (dependencies = {}) => {
  logger.info('Initializing background cron scheduler...');
  initCleanupJob();
  if (dependencies.reminderService) {
    initReminderLifecycleCron(dependencies.reminderService);
  }
  logger.info('All cron jobs scheduled successfully.');
};
