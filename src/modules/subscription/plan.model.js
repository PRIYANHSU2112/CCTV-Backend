import mongoose from 'mongoose';
import { PackageTier, BillingCycle, PlanStatus } from '../../shared/constants/enum.constant.js';

const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Plan name is required'],
      trim: true,
      minlength: [3, 'Plan name must be at least 3 characters'],
      maxlength: [100, 'Plan name cannot exceed 100 characters']
    },
    planCode: {
      type: String,
      required: [true, 'Plan code is required'],
      unique: true,
      uppercase: true,
      trim: true
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: [500, 'Description cannot exceed 500 characters']
    },
    packageTier: {
      type: String,
      enum: {
        values: Object.values(PackageTier),
        message: 'Invalid package tier'
      },
      default: PackageTier.BASIC,
      required: true
    },
    billingCycle: {
      type: String,
      enum: {
        values: Object.values(BillingCycle),
        message: 'Invalid billing cycle'
      },
      required: [true, 'Billing cycle is required']
    },
    durationInMonths: {
      type: Number,
      required: true,
      min: 1,
      max: 48,
      default: 1
    },
    basePrice: {
      type: Number,
      required: [true, 'Base price is required'],
      min: [0, 'Base price cannot be negative']
    },
    gstPercentage: {
      type: Number,
      default: 18,
      min: 0,
      max: 28
    },
    totalPrice: {
      type: Number,
      required: true
    },
    maxCameras: {
      type: Number,
      required: [true, 'Camera limit is required'],
      min: 1
    },
    features: [
      {
        type: String,
        trim: true
      }
    ],
    autoRenewalSupported: {
      type: Boolean,
      default: true
    },
    status: {
      type: String,
      enum: Object.values(PlanStatus),
      default: PlanStatus.ACTIVE,
      required: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
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

// Pre-validate hook to calculate total price inclusive of 18% GST and default activationMonths
subscriptionPlanSchema.pre('validate', function (next) {
  if (this.basePrice !== undefined && this.gstPercentage !== undefined) {
    const gstAmount = (this.basePrice * this.gstPercentage) / 100;
    this.totalPrice = Math.round((this.basePrice + gstAmount) * 100) / 100;
  }

  // Auto set durationInMonths according to billing cycle if not manually passed
  if (!this.durationInMonths && this.billingCycle) {
    const cycleDurations = {
      [BillingCycle.MONTHLY]: 1,
      [BillingCycle.QUARTERLY]: 3,
      [BillingCycle.HALF_YEARLY]: 6,
      [BillingCycle.YEARLY]: 12
    };
    this.durationInMonths = cycleDurations[this.billingCycle] || 1;
  }

  next();
});

subscriptionPlanSchema.index({ packageTier: 1 });
subscriptionPlanSchema.index({ billingCycle: 1, status: 1 });
subscriptionPlanSchema.index({ createdAt: -1 });

export const SubscriptionPlanModel =
  mongoose.models.SubscriptionPlan || mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
