import mongoose from 'mongoose';
import { PaymentMethod, PaymentStatus } from '../../shared/constants/enum.constant.js';

const paymentTransactionSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      default: null,
      index: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClientSubscription',
      default: null,
      index: true,
    },
    checkoutSessionId: {
      type: String,
      trim: true,
      index: true,
      default: null,
    },
    invoiceId: {
      type: String,
      trim: true,
      default: null,
    },
    amount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: [0.01, 'Payment amount must be greater than zero'],
    },
    planTotalPrice: {
      type: Number,
      default: null,
    },
    remainingAmount: {
      type: Number,
      default: 0,
    },
    amountPaise: {
      type: Number,
      min: 1,
      default: null,
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
      trim: true,
    },
    method: {
      type: String,
      enum: {
        values: Object.values(PaymentMethod),
        message: 'Invalid payment method',
      },
      required: [true, 'Payment method is required'],
    },
    status: {
      type: String,
      enum: {
        values: Object.values(PaymentStatus),
        message: 'Invalid payment status',
      },
      default: PaymentStatus.PAID,
      required: true,
      index: true,
    },
    paidAt: {
      type: Date,
      default: null,
      index: true,
    },
    receiptNo: {
      type: String,
      required: [true, 'Receipt number is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    transactionId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    note: {
      type: String,
      trim: true,
      maxlength: [500, 'Note cannot exceed 500 characters'],
      default: '',
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    razorpayOrderId: {
      type: String,
      trim: true,
      index: true,
      default: null,
    },
    razorpayPaymentId: {
      type: String,
      trim: true,
      index: true,
      default: null,
    },
    razorpaySignature: {
      type: String,
      trim: true,
      default: null,
    },
    failureReason: {
      type: String,
      trim: true,
      default: null,
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

paymentTransactionSchema.index({ clientId: 1, paidAt: -1 });
paymentTransactionSchema.index({ createdAt: -1 });
paymentTransactionSchema.index({ method: 1, status: 1 });

export const PaymentTransactionModel =
  mongoose.models.PaymentTransaction ||
  mongoose.model('PaymentTransaction', paymentTransactionSchema);
