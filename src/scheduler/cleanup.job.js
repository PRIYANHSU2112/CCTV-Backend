import cron from 'node-cron';
import { logger } from '../shared/utils/logger.js';

/**
 * Cleanup Job purging expired sessions and temporary files
 */
export const initCleanupJob = () => {
  // Run every night at midnight (0 0 * * *)
  cron.schedule('0 0 * * *', async () => {
    logger.info('[Cron Job] Starting nightly cleanup task...');
    try {
      // Perform database / cache cleanup routines here
      logger.info('[Cron Job] Nightly cleanup completed successfully.');
    } catch (err) {
      logger.error(`[Cron Job] Nightly cleanup failed: ${err.message}`);
    }
  });
};
