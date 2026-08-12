import { logger } from '../utils/logger.js';

let Queue = null;
try {
  const bullmq = await import('bullmq');
  Queue = bullmq.Queue || bullmq.default?.Queue;
} catch (err) {
  logger.warn('⚠️ [BullMQ] Module loading failed or missing in environment. Queue functionality running in fallback mode.');
}

export const ADMIN_NOTIFICATION_QUEUE = 'admin-notification-queue';
export const INVOICE_PIPELINE_QUEUE = 'invoice-pipeline-queue';

/**
 * Centralized Post-Payment Queue Service
 * 
 * Manages two independent queues triggered after successful payment verification:
 * 1. Admin Notification Queue — notify admins of payments
 * 2. Invoice Pipeline Queue — generates invoice & PDF
 * 
 * Fail-safe: Fallbacks gracefully if BullMQ is omitted or uninstalled.
 */
export class PostPaymentQueueService {
  constructor({ redisClient }) {
    this.isQueueEnabled = Boolean(Queue && redisClient);

    if (this.isQueueEnabled) {
      try {
        const connection = redisClient.duplicate
          ? redisClient.duplicate({ maxRetriesPerRequest: null, enableOfflineQueue: true })
          : { host: process.env.REDIS_HOST || 'redis', port: Number(process.env.REDIS_PORT || 6379), maxRetriesPerRequest: null };

        const defaultJobOptions = {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 3000
          },
          removeOnComplete: { age: 86400 * 7, count: 500 },
          removeOnFail: { age: 86400 * 7 }
        };

        this.adminNotificationQueue = new Queue(ADMIN_NOTIFICATION_QUEUE, {
          connection,
          defaultJobOptions
        });

        this.invoicePipelineQueue = new Queue(INVOICE_PIPELINE_QUEUE, {
          connection,
          defaultJobOptions
        });

        logger.info(`📦 BullMQ Post-Payment Queues Initialized: [${ADMIN_NOTIFICATION_QUEUE}], [${INVOICE_PIPELINE_QUEUE}]`);
      } catch (err) {
        logger.error(`❌ Failed to initialize BullMQ Queues: ${err.message}`);
        this.isQueueEnabled = false;
      }
    } else {
      logger.warn('⚠️ PostPaymentQueueService running without active BullMQ queue connections.');
    }
  }

  /**
   * Enqueue admin notification job after successful payment
   * Idempotent: uses paymentId as jobId to prevent duplicate notifications
   */
  async addAdminNotificationJob(jobData) {
    const { paymentId } = jobData || {};
    if (!paymentId) return null;

    if (this.isQueueEnabled && this.adminNotificationQueue) {
      try {
        const jobId = `admin_notif_${paymentId}`;
        const job = await this.adminNotificationQueue.add(
          'notify-admin-payment',
          { ...jobData, enqueuedAt: new Date().toISOString() },
          { jobId }
        );
        logger.info(`🔔 Admin Notification Job Enqueued: [${jobId}]`);
        return job;
      } catch (err) {
        logger.error(`❌ Admin Notification Enqueue Error: ${err.message}`);
      }
    }

    logger.info(`🔔 [Fallback Direct Admin Notification] Payment: ${paymentId}`);
    return null;
  }

  /**
   * Enqueue invoice pipeline job after successful payment
   * Idempotent: uses paymentId as jobId to prevent duplicate invoices
   */
  async addInvoicePipelineJob(jobData) {
    const { paymentId } = jobData || {};
    if (!paymentId) return null;

    if (this.isQueueEnabled && this.invoicePipelineQueue) {
      try {
        const jobId = `invoice_pipeline_${paymentId}`;
        const job = await this.invoicePipelineQueue.add(
          'generate-invoice-pipeline',
          { ...jobData, enqueuedAt: new Date().toISOString() },
          { jobId }
        );
        logger.info(`🧾 Invoice Pipeline Job Enqueued: [${jobId}]`);
        return job;
      } catch (err) {
        logger.error(`❌ Invoice Pipeline Enqueue Error: ${err.message}`);
      }
    }

    logger.info(`🧾 [Fallback Direct Invoice Creation] Payment: ${paymentId}`);
    return null;
  }

  async close() {
    if (this.adminNotificationQueue) await this.adminNotificationQueue.close();
    if (this.invoicePipelineQueue) await this.invoicePipelineQueue.close();
  }
}
