import { Queue } from 'bullmq';
import { logger } from '../../shared/utils/logger.js';

export const REMINDER_QUEUE_NAME = 'reminder-dispatch-queue';

export class ReminderQueueService {
  constructor({ redisClient }) {
    // BullMQ requires maxRetriesPerRequest: null for Redis connections
    const connection = redisClient.duplicate
      ? redisClient.duplicate({ maxRetriesPerRequest: null, enableOfflineQueue: true })
      : { host: process.env.REDIS_HOST || 'redis', port: Number(process.env.REDIS_PORT || 6379), maxRetriesPerRequest: null };

    this.queue = new Queue(REMINDER_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000 // Retry in 5s, 10s, 20s on failure
        },
        removeOnComplete: { age: 86400 * 7, count: 1000 }, // Keep last 7 days completed jobs
        removeOnFail: { age: 86400 * 14 }
      }
    });

    logger.info(`📦 BullMQ Queue Initialized: [${REMINDER_QUEUE_NAME}]`);
  }

  /**
   * Schedule or reschedule a reminder job in BullMQ
   */
  async scheduleJob(reminderRule) {
    const jobId = `reminder_rule_${reminderRule._id || reminderRule.id}`;

    // Remove any pre-existing job with this ID to prevent duplicates
    await this.removeJob(jobId);

    const payload = {
      ruleId: (reminderRule._id || reminderRule.id).toString(),
      clientId: reminderRule.clientId ? reminderRule.clientId.toString() : null,
      title: reminderRule.title,
      channels: reminderRule.channels,
      messageTemplate: reminderRule.messageTemplate
    };

    const jobOptions = { jobId };

    if (reminderRule.isRecurring && reminderRule.repeatEveryDays > 0) {
      // Recurring schedule: every N days (converted to milliseconds)
      const repeatEveryMs = reminderRule.repeatEveryDays * 24 * 60 * 60 * 1000;
      jobOptions.repeat = {
        every: repeatEveryMs,
        startDate: new Date(reminderRule.scheduledFor)
      };
    } else if (reminderRule.cronExpression) {
      // Recurring schedule: Cron Expression
      jobOptions.repeat = {
        pattern: reminderRule.cronExpression
      };
    } else {
      // One-time delayed job
      const delay = Math.max(0, new Date(reminderRule.scheduledFor).getTime() - Date.now());
      jobOptions.delay = delay;
    }

    await this.queue.add('dispatch-reminder', payload, jobOptions);
    logger.info(`⏰ BullMQ Job Scheduled: [${jobId}] for Rule ID: [${payload.ruleId}]`);
    return jobId;
  }

  /**
   * Remove a job from BullMQ
   */
  async removeJob(jobId) {
    try {
      const job = await this.queue.getJob(jobId);
      if (job) {
        await job.remove();
        logger.info(`🗑️ BullMQ Job Removed: [${jobId}]`);
      }
      // Remove repeatable job if configured
      const repeatableJobs = await this.queue.getRepeatableJobs();
      for (const rJob of repeatableJobs) {
        if (rJob.id === jobId || rJob.key.includes(jobId)) {
          await this.queue.removeRepeatableByKey(rJob.key);
          logger.info(`🗑️ BullMQ Repeatable Job Removed: [${rJob.key}]`);
        }
      }
    } catch (err) {
      logger.warn(`Could not remove BullMQ Job [${jobId}]: ${err.message}`);
    }
  }

  /**
   * Pause job execution
   */
  async pauseJob(jobId) {
    await this.removeJob(jobId);
  }

  /**
   * Add chunked bulk reminder jobs to BullMQ (batches of 50)
   */
  async addBulkReminders(jobs) {
    if (!jobs || !jobs.length) return [];
    const chunkSize = 50;
    const addedJobs = [];

    for (let i = 0; i < jobs.length; i += chunkSize) {
      const chunk = jobs.slice(i, i + chunkSize);
      const bulkPayload = chunk.map((j) => {
        const safeJobId = j.idempotencyKey
          ? String(j.idempotencyKey).replace(/[:/]/g, '__')
          : `bulk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        return {
          name: 'dispatch-reminder',
          data: j,
          opts: {
            jobId: safeJobId,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 5000,
            },
            removeOnComplete: { age: 86400 * 3, count: 1000 },
            removeOnFail: { age: 86400 * 7 },
          },
        };
      });

      const queued = await this.queue.addBulk(bulkPayload);
      addedJobs.push(...queued);
    }

    logger.info(`📦 BullMQ enqueued ${addedJobs.length} bulk reminder jobs`);
    return addedJobs;
  }

  async close() {
    await this.queue.close();
  }
}
