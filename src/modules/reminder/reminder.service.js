import { NotFoundError } from '../../shared/errors/not-found.error.js';
import { ReminderStatus, LogStatus, ReminderChannel } from './reminder.model.js';
import { ClientModel } from '../client/client.model.js';
import { ClientSubscriptionModel } from '../subscription/client-subscription.model.js';
import { getIstDayBoundsForOffset } from './reminder.repository.js';
import { logger } from '../../shared/utils/logger.js';

export class ReminderService {
  constructor({ reminderRepository, reminderQueueService, clientRepository }) {
    this.reminderRepository = reminderRepository;
    this.queueService = reminderQueueService;
    this.clientRepository = clientRepository;
  }

  /**
   * Process daily automated lifecycle rules (Runs 09:00 AM IST)
   */
  async processDailyLifecycleReminders() {
    logger.info('🔔 [Lifecycle Engine] Starting daily automated reminder evaluation in Asia/Kolkata timezone...');
    const config = await this.reminderRepository.getConfig();
    const rules = (config.rules || []).filter((r) => r.enabled);

    let totalEnqueued = 0;
    const ruleReports = [];

    for (const rule of rules) {
      try {
        const { clients, targetDateStr } = await this.reminderRepository.findEligibleClientsForLifecycleOffset(rule);
        if (!clients.length) {
          ruleReports.push({ ruleId: rule.id, label: rule.label, matched: 0, enqueued: 0 });
          continue;
        }

        const jobsToEnqueue = [];

        for (const client of clients) {
          // Filter channels by client notificationPreferences
          const clientPrefs = client.notificationPreferences || { whatsapp: true, sms: true, email: true };
          const activeChannels = (rule.channels || ['WhatsApp', 'SMS']).filter((ch) => {
            const key = ch.toLowerCase();
            return clientPrefs[key] !== false;
          });

          for (const channel of activeChannels) {
            // DB-Level Unique Idempotency Key
            const idempotencyKey = `lifecycle:${rule.id}:${client.clientId}:${targetDateStr}:${channel}`;

            // Create Log entry with DB unique index protection
            const logEntry = await this.reminderRepository.createLogWithIdempotency({
              idempotencyKey,
              ruleId: null,
              clientId: client.clientMongoId,
              channel,
              recipientPhone: client.phone,
              recipientEmail: client.email,
              status: LogStatus.QUEUED,
              message: rule.messageTemplate,
              scheduledFor: new Date(),
              attempts: 0,
            });

            // If log was already created earlier today, skip enqueueing
            if (!logEntry) {
              continue;
            }

            jobsToEnqueue.push({
              logId: logEntry._id.toString(),
              idempotencyKey,
              clientId: client.clientId,
              channel,
              messageTemplate: rule.messageTemplate,
              recipientPhone: client.phone,
              recipientEmail: client.email,
              amountDue: client.amountDue,
              planName: client.planName,
              dueDate: client.renewalDate,
              daysLeft: Math.abs(rule.offsetDays),
              clientName: client.name,
              businessName: client.businessName,
            });
          }
        }

        if (jobsToEnqueue.length > 0) {
          await this.queueService.addBulkReminders(jobsToEnqueue);
          totalEnqueued += jobsToEnqueue.length;
        }

        ruleReports.push({
          ruleId: rule.id,
          label: rule.label,
          matched: clients.length,
          enqueued: jobsToEnqueue.length,
        });
      } catch (ruleErr) {
        logger.error(`Error processing lifecycle rule [${rule.id}]: ${ruleErr.message}`);
      }
    }

    logger.info(`🔔 [Lifecycle Engine] Finished. Enqueued ${totalEnqueued} total lifecycle reminders.`);
    return { success: true, totalEnqueued, ruleReports };
  }

  /**
   * Phase 1: Unified Quick Send & Group Broadcast (Instant Dispatch)
   */
  async sendQuickReminder(payload) {
    const {
      recipientType = 'SINGLE',
      clientId,
      channels = ['WhatsApp', 'SMS'],
      messageTemplate,
      title = 'Payment Reminder',
    } = payload;

    if (!messageTemplate || !messageTemplate.trim()) {
      throw new Error('Message content is required');
    }

    const batchId = Date.now().toString(36);
    let targetClients = [];

    if (recipientType === 'SINGLE') {
      if (!clientId) throw new Error('Client ID is required for single reminder');
      const client = await ClientModel.findById(clientId).populate('userId', 'name phone email').lean().exec();
      if (!client) throw new NotFoundError('Client not found');

      const sub = await ClientSubscriptionModel.findOne({
        $or: [{ clientId: client._id }, { clientId: client.userId?._id }],
      }).sort({ createdAt: -1 }).populate('planId').lean().exec();

      targetClients.push({
        clientId: client._id.toString(),
        clientMongoId: client._id,
        name: client.name || client.userId?.name || 'Valued Client',
        businessName: client.businessName || 'Business Client',
        phone: client.phone || client.userId?.phone,
        email: client.email || client.userId?.email,
        notificationPreferences: client.notificationPreferences || { whatsapp: true, sms: true, email: true },
        amountDue: Number(sub?.remainingAmount || sub?.totalPlanPrice || 0),
        planName: sub?.planId?.name || sub?.packageTier || 'CCTV Plan',
        renewalDate: sub?.renewalDate || client.renewalDate,
      });
    } else {
      // Group Broadcast: ALL_CLIENTS | DUE_ONLY | OVERDUE_ONLY | RENEWING_SOON
      let clientQuery = {
        status: { $nin: ['Cancelled', 'Approach Client'] },
      };

      if (recipientType === 'OVERDUE_ONLY') {
        clientQuery.status = { $in: ['Overdue', 'OVERDUE', 'Due', 'DUE'] };
      }

      const clients = await ClientModel.find(clientQuery)
        .populate('userId', 'name phone email')
        .lean()
        .exec();

      for (const c of clients) {
        const sub = await ClientSubscriptionModel.findOne({
          $or: [{ clientId: c._id }, { clientId: c.userId?._id }],
        }).sort({ createdAt: -1 }).populate('planId').lean().exec();

        const amountDue = Number(sub?.remainingAmount || sub?.totalPlanPrice || 0);

        if (recipientType === 'DUE_ONLY' && amountDue <= 0) continue;

        if (recipientType === 'RENEWING_SOON') {
          const { end: weekEnd } = getIstDayBoundsForOffset(-7);
          if (!sub?.renewalDate || new Date(sub.renewalDate) > weekEnd) continue;
        }

        targetClients.push({
          clientId: c._id.toString(),
          clientMongoId: c._id,
          name: c.name || c.userId?.name || 'Valued Client',
          businessName: c.businessName || 'Business Client',
          phone: c.phone || c.userId?.phone,
          email: c.email || c.userId?.email,
          notificationPreferences: c.notificationPreferences || { whatsapp: true, sms: true, email: true },
          amountDue,
          planName: sub?.planId?.name || sub?.packageTier || 'CCTV Plan',
          renewalDate: sub?.renewalDate || c.renewalDate,
        });
      }
    }

    if (!targetClients.length) {
      return { success: true, message: 'No eligible recipients found matching criteria', queuedCount: 0 };
    }

    const jobsToEnqueue = [];

    for (const client of targetClients) {
      const clientPrefs = client.notificationPreferences || { whatsapp: true, sms: true, email: true };
      const selectedChannels = channels.filter((ch) => clientPrefs[ch.toLowerCase()] !== false);

      for (const channel of selectedChannels) {
        const idempotencyKey = `manual:${batchId}:${client.clientId}:${channel}`;

        const logEntry = await this.reminderRepository.createLogWithIdempotency({
          idempotencyKey,
          ruleId: null,
          clientId: client.clientMongoId,
          channel,
          recipientPhone: client.phone,
          recipientEmail: client.email,
          status: LogStatus.QUEUED,
          message: messageTemplate,
          scheduledFor: new Date(),
          attempts: 0,
        });

        if (!logEntry) continue;

        jobsToEnqueue.push({
          logId: logEntry._id.toString(),
          idempotencyKey,
          clientId: client.clientId,
          channel,
          messageTemplate,
          recipientPhone: client.phone,
          recipientEmail: client.email,
          amountDue: client.amountDue,
          planName: client.planName,
          dueDate: client.renewalDate,
          daysLeft: '',
          clientName: client.name,
          businessName: client.businessName,
        });
      }
    }

    if (jobsToEnqueue.length > 0) {
      await this.queueService.addBulkReminders(jobsToEnqueue);
    }

    return {
      success: true,
      recipientCount: targetClients.length,
      queuedCount: jobsToEnqueue.length,
      message: `Successfully queued ${jobsToEnqueue.length} reminder message(s) to ${targetClients.length} client(s)`,
    };
  }

  /**
   * Ingest Provider Webhooks (MSG91 / WhatsApp DLR)
   */
  async handleProviderWebhook(payload = {}) {
    logger.info(`📡 [Webhook Ingestion] Received DLR report: ${JSON.stringify(payload)}`);

    // Normalize provider identifiers
    const providerMsgId =
      payload.request_id ||
      payload.requestId ||
      payload.messageId ||
      payload.msgId ||
      payload.data?.id ||
      payload.id;

    if (!providerMsgId) {
      return { success: false, message: 'No provider message ID found in payload' };
    }

    const rawStatus = String(payload.status || payload.event || payload.data?.status || '').toUpperCase();
    let updatedStatus = null;

    if (rawStatus.includes('DELIVER') || rawStatus === '1' || rawStatus === 'SUCCESS') {
      updatedStatus = LogStatus.DELIVERED;
    } else if (rawStatus.includes('READ') || rawStatus === 'SEEN') {
      updatedStatus = LogStatus.READ;
    } else if (rawStatus.includes('FAIL') || rawStatus.includes('REJECT') || rawStatus === 'UNDELIVERED') {
      updatedStatus = LogStatus.FAILED;
    }

    if (updatedStatus) {
      const updateData = {
        status: updatedStatus,
        rawWebhookPayload: payload,
      };
      if (updatedStatus === LogStatus.DELIVERED) updateData.deliveredAt = new Date();
      if (updatedStatus === LogStatus.READ) updateData.readAt = new Date();
      if (updatedStatus === LogStatus.FAILED) {
        updateData.failureReason = payload.description || payload.reason || payload.error || 'Delivery failed at carrier';
      }

      const updated = await this.reminderRepository.updateLogByProviderId(providerMsgId, updateData);
      return { success: true, updated: Boolean(updated), status: updatedStatus };
    }

    return { success: true, message: 'Webhook payload recorded without state change' };
  }

  /**
   * Provider-Idempotent Retry for Failed Reminders
   */
  async retryFailedReminder(logId) {
    const log = await this.reminderRepository.findLogById(logId);
    if (!log) throw new NotFoundError('Reminder log record not found');

    log.status = LogStatus.QUEUED;
    log.failureReason = null;
    await log.save();

    await this.queueService.addBulkReminders([
      {
        logId: log._id.toString(),
        idempotencyKey: log.idempotencyKey,
        clientId: log.clientId?._id?.toString() || log.clientId?.toString(),
        channel: log.channel,
        messageTemplate: log.message,
        recipientPhone: log.recipientPhone,
        recipientEmail: log.recipientEmail,
        clientName: log.clientId?.name || 'Valued Client',
        businessName: log.clientId?.businessName || 'Business Client',
      },
    ]);

    return { success: true, message: 'Reminder queued for retry' };
  }

  /**
   * Reminder KPI Statistics
   */
  async getReminderStats() {
    return this.reminderRepository.getReminderStats();
  }

  async createReminder(payload) {
    const rule = await this.reminderRepository.createRule(payload);
    const jobId = await this.queueService.scheduleJob(rule);
    rule.bullmqJobId = jobId;
    await rule.save();
    return rule;
  }

  async updateReminder(id, updateData) {
    const rule = await this.reminderRepository.findRuleById(id);
    if (!rule) throw new NotFoundError('Reminder rule not found');

    Object.assign(rule, updateData);
    await rule.save();

    if (rule.status === ReminderStatus.ACTIVE) {
      const jobId = await this.queueService.scheduleJob(rule);
      rule.bullmqJobId = jobId;
      await rule.save();
    } else {
      await this.queueService.pauseJob(rule.bullmqJobId || `reminder_rule_${rule._id}`);
    }

    return rule;
  }

  async pauseReminder(id) {
    const rule = await this.reminderRepository.findRuleById(id);
    if (!rule) throw new NotFoundError('Reminder rule not found');

    rule.status = ReminderStatus.PAUSED;
    await rule.save();

    await this.queueService.pauseJob(rule.bullmqJobId || `reminder_rule_${rule._id}`);
    return rule;
  }

  async resumeReminder(id) {
    const rule = await this.reminderRepository.findRuleById(id);
    if (!rule) throw new NotFoundError('Reminder rule not found');

    rule.status = ReminderStatus.ACTIVE;
    const jobId = await this.queueService.scheduleJob(rule);
    rule.bullmqJobId = jobId;
    await rule.save();

    return rule;
  }

  async deleteReminder(id) {
    const rule = await this.reminderRepository.findRuleById(id);
    if (!rule) throw new NotFoundError('Reminder rule not found');

    await this.queueService.removeJob(rule.bullmqJobId || `reminder_rule_${rule._id}`);
    await this.reminderRepository.deleteRule(id);

    return { success: true, message: 'Reminder deleted successfully' };
  }

  async listReminders(queryParams) {
    const page = parseInt(queryParams.page || 1, 10);
    const limit = parseInt(queryParams.limit || 10, 10);
    const skip = (page - 1) * limit;

    const { items, total } = await this.reminderRepository.findPaginatedRules({
      skip,
      limit,
      status: queryParams.status,
      search: queryParams.search,
    });

    return { items, page, limit, total };
  }

  async getReminderConfig() {
    return this.reminderRepository.getConfig();
  }

  async updateReminderConfig(config) {
    return this.reminderRepository.saveConfig(config);
  }

  async listLogs(queryParams) {
    const page = parseInt(queryParams.page || 1, 10);
    const limit = parseInt(queryParams.limit || 10, 10);
    const skip = (page - 1) * limit;

    const { items, total } = await this.reminderRepository.findPaginatedLogs({
      skip,
      limit,
      status: queryParams.status,
      channel: queryParams.channel,
      search: queryParams.search,
    });

    return { items, page, limit, total };
  }
}
