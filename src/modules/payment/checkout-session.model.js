import mongoose from 'mongoose';
import { CheckoutSessionStatus } from '../../shared/constants/enum.constant.js';

const customerSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    businessName: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true },
    gstin: { type: String, trim: true, uppercase: true, default: '' },
    state: { type: String, trim: true, default: 'Madhya Pradesh' },
  },
  { _id: false },
);

const checkoutSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
      required: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      default: null,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClientSubscription',
      default: null,
      index: true,
    },
    existingSubscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClientSubscription',
      default: null,
    },
    paymentTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentTransaction',
      default: null,
    },
    customer: {
      type: customerSnapshotSchema,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    planTotalPrice: {
      type: Number,
      default: null,
    },
    remainingAmount: {
      type: Number,
      default: 0,
    },
    durationInMonths: {
      type: Number,
      default: 1,
    },
    installationCharge: {
      type: Number,
      default: 0,
    },
    installationHsnSac: {
      type: String,
      trim: true,
      default: '995469',
    },
    installationGst: {
      type: Number,
      default: 0,
    },
    isNewSubscription: {
      type: Boolean,
      default: true,
    },
    amountPaise: {
      type: Number,
      required: true,
      min: 1,
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
    },
    razorpayOrderId: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(CheckoutSessionStatus),
      default: CheckoutSessionStatus.PENDING,
      index: true,
    },
    failureReason: {
      type: String,
      trim: true,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

checkoutSessionSchema.index({ status: 1, expiresAt: 1 });

export const CheckoutSessionModel =
  mongoose.models.CheckoutSession ||
  mongoose.model('CheckoutSession', checkoutSessionSchema);
