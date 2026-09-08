import { BaseRepository } from '../../shared/bases/base.repository.js';
import { ReminderRuleModel, ReminderLogModel, ReminderConfigModel, LogStatus, ReminderChannel } from './reminder.model.js';
import { ClientSubscriptionModel } from '../subscription/client-subscription.model.js';
import { ClientModel } from '../client/client.model.js';
import { UserModel } from '../user/user.model.js';

export const DEFAULT_LIFECYCLE_RULES = [
  {
    id: 'rem-7-before',
    label: '7 Days Before Renewal',
    offsetDays: -7,
    enabled: true,
    channels: ['WhatsApp', 'Email'],
    targetAudience: 'ALL_ELIGIBLE',
    messageTemplate:
      'Dear {{clientName}}, your CCTV surveillance subscription for {{businessName}} ({{planName}}) will renew in 7 days on {{dueDate}}. Amount due: {{amountDue}}. Click here to pay: {{paymentLink}}',
  },
  {
    id: 'rem-3-before',
    label: '3 Days Before Renewal',
    offsetDays: -3,
    enabled: true,
    channels: ['WhatsApp', 'SMS'],
    targetAudience: 'ALL_ELIGIBLE',
    messageTemplate:
      'Reminder: Your CCTV subscription for {{businessName}} is renewing in 3 days on {{dueDate}}. Pending balance: {{amountDue}}. Please pay promptly to avoid interruption: {{paymentLink}}',
  },
  {
    id: 'rem-1-before',
    label: '1 Day Before Renewal',
    offsetDays: -1,
    enabled: true,
    channels: ['WhatsApp', 'SMS'],
    targetAudience: 'ALL_ELIGIBLE',
    messageTemplate:
      'Urgent Notice: Tomorrow is the renewal date for your CCTV subscription ({{businessName}}). Amount: {{amountDue}}. Pay now: {{paymentLink}}',
  },
  {
    id: 'rem-due-day',
    label: 'On Due Date (Renewal Day)',
    offsetDays: 0,
    enabled: true,
    channels: ['WhatsApp', 'SMS', 'Email'],
    targetAudience: 'ALL_ELIGIBLE',
    messageTemplate:
      'Today is your CCTV monitoring subscription renewal date. Please complete payment of {{amountDue}} for {{businessName}} today: {{paymentLink}} - Saburi Security',
  },
  {
    id: 'rem-3-after',
    label: '3 Days Overdue (Grace Period)',
    offsetDays: 3,
    enabled: true,
    channels: ['WhatsApp', 'SMS'],
    targetAudience: 'OVERDUE_ONLY',
    messageTemplate:
      'Payment Overdue: Your CCTV subscription payment of {{amountDue}} for {{businessName}} is 3 days overdue. Pay immediately to keep camera live monitoring active: {{paymentLink}}',
  },
  {
    id: 'rem-7-after',
    label: '7 Days Overdue (Suspension Warning)',
    offsetDays: 7,
    enabled: true,
    channels: ['WhatsApp', 'SMS'],
    targetAudience: 'OVERDUE_ONLY',
    messageTemplate:
      'Final Notice: Payment of {{amountDue}} for {{businessName}} is 7 days overdue. Your CCTV feed and alert services are scheduled for suspension in 24 hours. Clear balance: {{paymentLink}}',
  },
  {
    id: 'rem-suspended',
    label: 'Reconnection Notice (Suspended)',
    offsetDays: 15,
    enabled: false,
    channels: ['WhatsApp', 'SMS'],
    targetAudience: 'SUSPENDED_ONLY',
    messageTemplate:
      'Your CCTV surveillance service for {{businessName}} is currently suspended. Clear your pending dues of {{amountDue}} to instantly restore active security monitoring: {{paymentLink}}',
  },
];

/**
 * Calculates start and end Date objects in UTC corresponding to full 24-hour day in Asia/Kolkata
 */
export function getIstDayBoundsForOffset(offsetDaysFromToday) {
  // Get current date string in Asia/Kolkata (YYYY-MM-DD)
  const now = new Date();
  const istFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayIstStr = istFormatter.format(now); // "YYYY-MM-DD"
  const [y, m, d] = todayIstStr.split('-').map(Number);

  // Offset in calendar days (reminder offsetDays: -7 means renewal is 7 days from today => +7)
  const daysToAdd = -offsetDaysFromToday;
  const targetDateObj = new Date(Date.UTC(y, m - 1, d + daysToAdd));
  const targetY = targetDateObj.getUTCFullYear();
  const targetM = String(targetDateObj.getUTCMonth() + 1).padStart(2, '0');
  const targetD = String(targetDateObj.getUTCDate()).padStart(2, '0');
  const targetDateStr = `${targetY}-${targetM}-${targetD}`;

  // Start & End in IST (+05:30)
  const start = new Date(`${targetDateStr}T00:00:00.000+05:30`);
  const end = new Date(`${targetDateStr}T23:59:59.999+05:30`);

  return { start, end, targetDateStr, todayIstStr };
}

export class ReminderRepository extends BaseRepository {
  constructor() {
    super();
    this.model = ReminderRuleModel;
    this.logModel = ReminderLogModel;
    this.configModel = ReminderConfigModel;
  }

  async getConfig() {
    let doc = await this.configModel.findOne({ key: 'global_reminder_config' }).lean().exec();
    if (!doc) {
      doc = await this.configModel.create({
        key: 'global_reminder_config',
        rules: DEFAULT_LIFECYCLE_RULES,
        dailyExecutionTime: '09:00',
        timezone: 'Asia/Kolkata',
      });
      return doc.toJSON ? doc.toJSON() : doc;
    }
    return doc;
  }

  async saveConfig(configData) {
    const rules = Array.isArray(configData) ? configData : configData.rules;
    const update = {
      rules: rules && rules.length ? rules : DEFAULT_LIFECYCLE_RULES,
      dailyExecutionTime: configData.dailyExecutionTime || '09:00',
      timezone: configData.timezone || 'Asia/Kolkata',
      quietHoursStart: configData.quietHoursStart || '21:00',
      quietHoursEnd: configData.quietHoursEnd || '08:00',
    };

    return this.configModel
      .findOneAndUpdate(
        { key: 'global_reminder_config' },
        { $set: update },
        { upsert: true, new: true, runValidators: true }
      )
      .lean()
      .exec();
  }

  async createRule(data) {
    const rule = new this.model(data);
    return rule.save();
  }

  async findRuleById(id) {
    if (!id || typeof id !== 'string' || id.length !== 24) return null;
    return this.model.findById(id).exec();
  }

  async updateRule(id, updateData) {
    return this.model.findByIdAndUpdate(id, { $set: updateData }, { new: true, runValidators: true }).exec();
  }

  async deleteRule(id) {
    return this.model.findByIdAndDelete(id).exec();
  }

  async findPaginatedRules({ skip = 0, limit = 10, status = null, search = '' }) {
    const query = {};
    if (status && status !== 'all') query.status = status;
    if (search) query.title = { $regex: search, $options: 'i' };

    const [items, total] = await Promise.all([
      this.model.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.model.countDocuments(query)
    ]);
    return { items, total };
  }

  async findPaginatedLogs({ skip = 0, limit = 10, status = null, channel = null, search = '' }) {
    const query = {};
    if (status && status !== 'all') query.status = status;
    if (channel && channel !== 'all') query.channel = channel;
    if (search) {
      query.$or = [
        { recipientPhone: { $regex: search, $options: 'i' } },
        { message: { $regex: search, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.logModel
        .find(query)
        .populate('clientId', 'businessName name phone email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.logModel.countDocuments(query)
    ]);
    return { items, total };
  }

  /**
   * DB-Level Idempotent Log Insertion
   * Uses unique compound index on idempotencyKey. If key exists, skips safely without error.
   */
  async createLogWithIdempotency(logData) {
    try {
      const log = new this.logModel(logData);
      return await log.save();
    } catch (err) {
      if (err.code === 11000) {
        // Duplicate key: already created
        return null;
      }
      throw err;
    }
  }

  async findLogById(id) {
    if (!id || typeof id !== 'string' || id.length !== 24) return null;
    return this.logModel.findById(id).populate('clientId').exec();
  }

  async updateLogById(id, updateData) {
    return this.logModel.findByIdAndUpdate(id, { $set: updateData }, { new: true }).exec();
  }

  async findLogByProviderId(providerMessageId) {
    if (!providerMessageId) return null;
    return this.logModel.findOne({
      $or: [{ providerMessageId }, { clientRequestId: providerMessageId }]
    }).exec();
  }

  async updateLogByProviderId(providerMessageId, updateData) {
    return this.logModel.findOneAndUpdate(
      { $or: [{ providerMessageId }, { clientRequestId: providerMessageId }] },
      { $set: updateData },
      { new: true }
    ).exec();
  }

  /**
   * Query eligible clients for automated daily lifecycle rule
   */
  async findEligibleClientsForLifecycleOffset(rule) {
    const { offsetDays, targetAudience } = rule;
    const { start, end, targetDateStr, todayIstStr } = getIstDayBoundsForOffset(offsetDays);

    // 1. Base Subscription Query by renewalDate within target IST day
    const subQuery = {
      renewalDate: { $gte: start, $lte: end },
    };

    // 2. Status Matrix Filtering
    if (targetAudience === 'SUSPENDED_ONLY') {
      subQuery.status = { $in: ['SUSPENDED', 'Suspended'] };
    } else if (targetAudience === 'OVERDUE_ONLY') {
      subQuery.status = { $in: ['DUE', 'Due', 'OVERDUE', 'Overdue', 'ACTIVE', 'Active'] };
      subQuery.remainingAmount = { $gt: 0 };
    } else {
      // ALL_ELIGIBLE (Pre-Renewal & Due Day)
      subQuery.status = {
        $in: ['ACTIVE', 'Active', 'DUE', 'Due', 'PENDING_PAYMENT', 'Pending Payment', 'OVERDUE', 'Overdue']
      };
      // Explicit rule: Exclude fully paid subscriptions with no remaining balance
      subQuery.remainingAmount = { $gt: 0 };
    }

    // Exclude CANCELLED subscriptions always
    subQuery.status.$nin = ['CANCELLED', 'Cancelled'];

    const subscriptions = await ClientSubscriptionModel.find(subQuery)
      .populate('planId')
      .lean()
      .exec();

    if (!subscriptions.length) {
      return { clients: [], targetDateStr, todayIstStr };
    }

    const clientResults = [];

    for (const sub of subscriptions) {
      // Find matching client profile
      const client = await ClientModel.findOne({
        $or: [
          { _id: sub.clientId },
          { userId: sub.clientId }
        ]
      }).populate('userId', 'name phone email').lean().exec();

      if (!client) continue;

      // Exclude approach clients (handled manually) or clients with cancelled profile
      if (client.status === 'Cancelled' || client.status === 'Approach Client') continue;
      if (targetAudience !== 'SUSPENDED_ONLY' && (client.status === 'Suspended' || client.status === 'SUSPENDED')) continue;

      const user = client.userId || {};
      const phone = client.phone || user.phone;
      const email = client.email || user.email;
      const name = client.name || user.name || 'Contact Person';
      const businessName = client.businessName || 'Business Client';

      clientResults.push({
        clientId: client._id.toString(),
        clientMongoId: client._id,
        subscriptionId: sub._id.toString(),
        subscription: sub,
        name,
        businessName,
        phone,
        email,
        notificationPreferences: client.notificationPreferences || { whatsapp: true, sms: true, email: true },
        amountDue: Number(sub.remainingAmount || sub.totalPlanPrice || 0),
        planName: sub.planId?.name || sub.packageTier || 'CCTV Surveillance Plan',
        renewalDate: sub.renewalDate,
        offsetDays,
      });
    }

    return { clients: clientResults, targetDateStr, todayIstStr };
  }

  /**
   * Get reminder analytics KPIs (Sent Today, Delivered, Failed, Total Queued)
   */
  async getReminderStats() {
    const { start: todayStart } = getIstDayBoundsForOffset(0);

    const [sentToday, deliveredToday, failedToday, queuedTotal] = await Promise.all([
      this.logModel.countDocuments({ createdAt: { $gte: todayStart }, status: { $in: [LogStatus.SENT, LogStatus.DELIVERED, LogStatus.READ] } }),
      this.logModel.countDocuments({ createdAt: { $gte: todayStart }, status: { $in: [LogStatus.DELIVERED, LogStatus.READ] } }),
      this.logModel.countDocuments({ createdAt: { $gte: todayStart }, status: LogStatus.FAILED }),
      this.logModel.countDocuments({ status: { $in: [LogStatus.QUEUED, LogStatus.PROCESSING] } }),
    ]);

    const deliveryRate = sentToday > 0 ? Math.round((deliveredToday / sentToday) * 100) : 100;

    return {
      sentToday,
      deliveredToday,
      failedToday,
      queuedTotal,
      deliveryRate,
    };
  }
}
