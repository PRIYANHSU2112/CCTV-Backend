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
  SENT: 'Sent',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled'
});

/**
 * 1. Reminder Rule Configuration Model (Source of Truth)
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
    repeatEveryDays: { type: Number, min: 1, default: null }, // e.g., 3 for every 3 days
    cronExpression: { type: String, trim: true, default: null }, // Optional Cron expression e.g. "0 9 */3 * *"
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
    bullmqJobId: { type: String, default: null, index: true }, // Deterministic BullMQ Job ID
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
 * 2. Reminder Execution Log Model (Audit & History)
 */
const reminderLogSchema = new mongoose.Schema(
  {
    ruleId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReminderRule', required: true, index: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null, index: true },
    channel: { type: String, enum: Object.values(ReminderChannel), required: true },
    status: {
      type: String,
      enum: Object.values(LogStatus),
      default: LogStatus.QUEUED,
      required: true,
      index: true
    },
    message: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    scheduledFor: { type: Date, required: true },
    sentAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
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

reminderLogSchema.index({ ruleId: 1, createdAt: -1 });

export const ReminderRuleModel =
  mongoose.models.ReminderRule || mongoose.model('ReminderRule', reminderRuleSchema);
export const ReminderLogModel =
  mongoose.models.ReminderLog || mongoose.model('ReminderLog', reminderLogSchema);
