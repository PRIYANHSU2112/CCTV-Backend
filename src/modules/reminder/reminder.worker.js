import { Worker } from 'bullmq';
import { REMINDER_QUEUE_NAME } from './reminder-queue.service.js';
import { ReminderRuleModel, ReminderLogModel, LogStatus, ReminderStatus } from './reminder.model.js';
import { logger } from '../../shared/utils/logger.js';

export class ReminderWorker {
  constructor({ redisClient, clientRepository }) {
    // BullMQ Worker requires maxRetriesPerRequest: null on blocking Redis connection
    const connection = redisClient.duplicate
      ? redisClient.duplicate({ maxRetriesPerRequest: null, enableOfflineQueue: true })
      : { host: process.env.REDIS_HOST || 'redis', port: Number(process.env.REDIS_PORT || 6379), maxRetriesPerRequest: null };
    this.clientRepository = clientRepository;

    this.worker = new Worker(
      REMINDER_QUEUE_NAME,
      async (job) => {
        return this.processJob(job);
      },
      {
        connection,
        concurrency: 5 // Process 5 reminder dispatches concurrently
      }
    );

    this.worker.on('completed', (job) => {
      logger.info(`✅ BullMQ Worker Completed Job [${job.id}]`);
    });

    this.worker.on('failed', (job, err) => {
      logger.error(`❌ BullMQ Worker Failed Job [${job?.id}]: ${err.message}`);
    });

    logger.info(`👷 BullMQ Background Worker Started for Queue: [${REMINDER_QUEUE_NAME}]`);
  }

  /**
   * Execute Job Dispatch logic
   */
  async processJob(job) {
    const { ruleId, clientId, messageTemplate, channels } = job.data;

    // 1. Fetch Source of Truth from MongoDB
    const rule = await ReminderRuleModel.findById(ruleId);
    if (!rule || rule.status !== ReminderStatus.ACTIVE) {
      logger.info(`Skipping Job [${job.id}]: Reminder Rule is inactive or missing`);
      return { skipped: true };
    }

    const client = clientId ? await this.clientRepository.findById(clientId) : null;
    const clientName = client?.name || client?.businessName || 'Valued Client';

    // 2. Render Template Placeholders
    const formattedMessage = messageTemplate
      .replace(/{{clientName}}/g, clientName)
      .replace(/{{dueDate}}/g, rule.scheduledFor ? new Date(rule.scheduledFor).toLocaleDateString('en-IN') : '');

    // 3. Dispatch for each configured channel
    for (const channel of channels) {
      const log = new ReminderLogModel({
        ruleId: rule._id,
        clientId: client?._id || null,
        channel,
        status: LogStatus.PROCESSING,
        message: formattedMessage,
        scheduledFor: new Date(),
        bullmqJobId: job.id,
        attempts: job.attemptsMade + 1
      });
      await log.save();

      try {
        // Mock / Actual Gateway Dispatch (WhatsApp / SMS / Email API)
        await this.dispatchNotification(channel, client, formattedMessage);

        log.status = LogStatus.SENT;
        log.sentAt = new Date();
        await log.save();
      } catch (error) {
        log.status = LogStatus.FAILED;
        log.failureReason = error.message;
        await log.save();
        throw error; // Re-throw to trigger BullMQ exponential retry
      }
    }

    // 4. Update Rule trigger timestamps in MongoDB
    rule.lastTriggeredAt = new Date();
    if (!rule.isRecurring && !rule.cronExpression) {
      rule.status = ReminderStatus.COMPLETED;
    }
    await rule.save();

    return { success: true, processedChannels: channels.length };
  }

  async dispatchNotification(channel, client, message) {
    // Gateway integration wrapper (Twilio / Meta WhatsApp API / AWS SES)
    logger.info(`📡 Dispatched [${channel}] to [${client?.phone || 'Client'}]: "${message}"`);
    return true;
  }

  async close() {
    await this.worker.close();
  }
}
