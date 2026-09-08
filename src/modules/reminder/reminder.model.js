import mongoose from 'mongoose';

export const ReminderChannel = Object.freeze({
  SMS: 'SMS',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  PUSH: 'Push'
});

export const ReminderStatus = Object.freeze({
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled'
});

export const LogStatus = Object.freeze({
  QUEUED: 'Queued',
  PROCESSING: 'Processing',
  SENT: 'Sent',             // Dispatched to gateway provider
  DELIVERED: 'Delivered',   // Confirmed via provider DLR webhook
  READ: 'Read',             // Confirmed read receipt
  FAILED: 'Failed',         // Rejected by provider or network failure
  CANCELLED: 'Cancelled'
});

/**
 * 1. Persistent Lifecycle & Reminder Schedule Config Model
 */
const lifecycleRuleSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    offsetDays: { type: Number, required: true }, // -7, -3, -1, 0, 3, 7
    enabled: { type: Boolean, default: true },
    channels: {
      type: [String],
      enum: Object.values(ReminderChannel),
      default: [ReminderChannel.WHATSAPP, ReminderChannel.SMS]
    },
    messageTemplate: { type: String, required: true, trim: true },
    targetAudience: {
      type: String,
      enum: ['ALL_ELIGIBLE', 'DUE_ONLY', 'OVERDUE_ONLY', 'SUSPENDED_ONLY'],
      default: 'ALL_ELIGIBLE'
    }
  },
  { _id: false }
);

const reminderConfigSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'global_reminder_config', unique: true, index: true },
    rules: [lifecycleRuleSchema],
    dailyExecutionTime: { type: String, default: '09:00' }, // 09:00 AM IST
    timezone: { type: String, default: 'Asia/Kolkata' },
    quietHoursStart: { type: String, default: '21:00' },
    quietHoursEnd: { type: String, default: '08:00' },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

/**
 * 2. Reminder Rule Configuration Model (Custom / Ad-hoc Scheduled Rules)
 */
const reminderRuleSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Reminder title is required'], trim: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null, index: true },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientSubscription', default: null, index: true },
    channels: {
      type: [String],
      enum: {
        values: Object.values(ReminderChannel),
        message: 'Invalid channel'
      },
      default: [ReminderChannel.WHATSAPP, ReminderChannel.SMS]
    },
    messageTemplate: { type: String, required: [true, 'Message template is required'], trim: true },
    // Schedule Configuration
    isRecurring: { type: Boolean, default: false },
    repeatEveryDays: { type: Number, min: 1, default: null },
    cronExpression: { type: String, trim: true, default: null },
    scheduledFor: { type: Date, required: [true, 'Scheduled date is required'], index: true },

    // Status & State
    status: {
      type: String,
      enum: {
        values: Object.values(ReminderStatus),
        message: 'Invalid reminder status'
      },
      default: ReminderStatus.ACTIVE,
      required: true,
      index: true
    },
    bullmqJobId: { type: String, default: null, index: true },
    lastTriggeredAt: { type: Date, default: null },
    nextTriggerAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

reminderRuleSchema.index({ status: 1, nextTriggerAt: 1 });

/**
 * 3. Reminder Execution Log Model (Audit, Webhook DLR Tracking, & DB Idempotency)
 */
const reminderLogSchema = new mongoose.Schema(
  {
    idempotencyKey: {
      type: String,
      required: [true, 'Idempotency key is required'],
      unique: true,
      index: true
    },
    ruleId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReminderRule', default: null, index: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null, index: true },
    channel: { type: String, enum: Object.values(ReminderChannel), required: true },
    recipientPhone: { type: String, default: null },
    recipientEmail: { type: String, default: null },
    status: {
      type: String,
      enum: Object.values(LogStatus),
      default: LogStatus.QUEUED,
      required: true,
      index: true
    },
    message: { type: String, required: true },
    clientRequestId: { type: String, default: null, index: true },
    providerMessageId: { type: String, default: null, index: true },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    scheduledFor: { type: Date, default: Date.now },
    sentAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    readAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
    rawWebhookPayload: { type: mongoose.Schema.Types.Mixed, default: null },
    bullmqJobId: { type: String, default: null }
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

reminderLogSchema.index({ clientId: 1, createdAt: -1 });
reminderLogSchema.index({ status: 1, createdAt: -1 });

export const ReminderConfigModel =
  mongoose.models.ReminderConfig || mongoose.model('ReminderConfig', reminderConfigSchema);
export const ReminderRuleModel =
  mongoose.models.ReminderRule || mongoose.model('ReminderRule', reminderRuleSchema);
export const ReminderLogModel =
  mongoose.models.ReminderLog || mongoose.model('ReminderLog', reminderLogSchema);

