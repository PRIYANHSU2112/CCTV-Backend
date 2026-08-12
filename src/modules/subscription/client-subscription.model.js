import mongoose from 'mongoose';
import { PackageTier, SubscriptionStatus } from '../../shared/constants/enum.constant.js';

const clientSubscriptionSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Client ID is required'],
      index: true
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
      required: [true, 'Subscription Plan ID is required']
    },
    packageTier: {
      type: String,
      enum: Object.values(PackageTier),
      required: true
    },
    cameraCount: {
      type: Number,
      required: [true, 'Camera count is required'],
      min: 1
    },
    monthlyCharge: {
      type: Number,
      required: [true, 'Monthly charge is required']
    },
    contractStartDate: {
      type: Date,
      required: [true, 'Contract start date is required']
    },
    renewalDate: {
      type: Date,
      required: [true, 'Renewal date is required'],
      index: true
    },
    autoRenewal: {
      type: Boolean,
      default: true
    },
    status: {
      type: String,
      enum: Object.values(SubscriptionStatus),
      default: SubscriptionStatus.ACTIVE,
      required: true,
      index: true
    },
    lastPaymentDate: {
      type: Date
    },
    suspendedAt: {
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

clientSubscriptionSchema.index({ renewalDate: 1, status: 1 });
clientSubscriptionSchema.index({ clientId: 1, status: 1 });
clientSubscriptionSchema.index({ createdAt: -1 });

export const ClientSubscriptionModel =
  mongoose.models.ClientSubscription || mongoose.model('ClientSubscription', clientSubscriptionSchema);
