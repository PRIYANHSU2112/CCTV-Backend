import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    // Target User (Recipient)
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },

    // Notification Content
    title: {
      type: String,
      trim: true,
      maxlength: [150, 'Title cannot exceed 150 characters']
    },
    message: {
      type: String,
      required: [true, 'Notification message body is required'],
      trim: true,
      maxlength: [1000, 'Message cannot exceed 1000 characters']
    },

    // Category / Domain Type
    type: {
      type: String,
      enum: {
        values: ['SYSTEM', 'PAYMENT', 'SUBSCRIPTION', 'INVOICE', 'REMINDER', 'SECURITY', 'ALERT'],
        message: 'Invalid notification type'
      },
      default: 'SYSTEM',
      index: true
    },

    // Priority Level
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'MEDIUM'
    },

    // Delivery Channel
    channel: {
      type: String,
      enum: ['IN_APP', 'EMAIL', 'SMS', 'PUSH'],
      default: 'IN_APP'
    },

    // Deep-linking / Navigation URL
    actionUrl: {
      type: String,
      trim: true,
      default: null
    },

    // Additional Payload / Metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    // Read / Unread Status
    isRead: {
      type: Boolean,
      default: false,
      index: true
    },
    readAt: {
      type: Date,
      default: null
    }
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

// High-Performance Compound Indexes
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });

export const NotificationModel =
  mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
