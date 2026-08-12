import { logger } from '../../shared/utils/logger.js';

let Queue = null;
try {
  const bullmq = await import('bullmq');
  Queue = bullmq.Queue || bullmq.default?.Queue;
} catch (err) {
  logger.warn('⚠️ [BullMQ PDF Queue] Module loading failed or missing in environment.');
}

export const PDF_QUEUE_NAME = 'pdf-generation-queue';

export class PdfQueueService {
  constructor({ redisClient }) {
    if (!Queue) {
      logger.warn('⚠️ PdfQueueService disabled because BullMQ Queue module is missing.');
      return;
    }

    const connection = redisClient.duplicate
      ? redisClient.duplicate({ maxRetriesPerRequest: null, enableOfflineQueue: true })
      : { host: process.env.REDIS_HOST || 'redis', port: Number(process.env.REDIS_PORT || 6379), maxRetriesPerRequest: null };

    this.queue = new Queue(PDF_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 3000
        },
        removeOnComplete: { age: 86400 * 7, count: 500 },
        removeOnFail: { age: 86400 * 7 }
      }
    });

    logger.info(`📦 BullMQ PDF Queue Initialized: [${PDF_QUEUE_NAME}]`);
  }

  /**
   * Add a PDF generation job to BullMQ queue
   */
  async addPdfJob(invoiceId) {
    if (!this.queue) {
      logger.warn(`⚠️ PDF job skipped for invoice [${invoiceId}] (Queue disabled).`);
      return null;
    }
    if (!invoiceId) return null;
    const jobId = `pdf_invoice_${invoiceId}`;
    const job = await this.queue.add(
      'generate-pdf',
      { invoiceId: invoiceId.toString() },
      { jobId }
    );
    logger.info(`📄 BullMQ PDF Job Added: [${jobId}]`);
    return job;
  }

  async close() {
    await this.queue.close();
  }
}
