import mongoose from 'mongoose';

/**
 * Invoice Status Enum
 */
export const InvoiceStatus = Object.freeze({
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  UNPAID: 'UNPAID',
  PAID: 'PAID',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  OVERDUE: 'OVERDUE',
  CANCELLED: 'CANCELLED',
  VOID: 'VOID'
});

/**
 * Invoice Type Enum (New Plan vs Renewal vs Custom)
 */
export const InvoiceType = Object.freeze({
  NEW_PLAN: 'NEW_PLAN',
  RENEWAL: 'RENEWAL',
  CUSTOM: 'CUSTOM'
});

/**
 * PDF Generation Status Enum
 */
export const PdfStatus = Object.freeze({
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
});

/**
 * Atomic Counter Schema for Concurrent Sequence Generation
 */
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export const CounterModel =
  mongoose.models.Counter || mongoose.model('Counter', counterSchema);

/**
 * Atomic helper to increment sequence safely under concurrency
 */
export const getNextSequenceValue = async (sequenceName = 'invoiceNumber') => {
  const counter = await CounterModel.findByIdAndUpdate(
    sequenceName,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  ).exec();
  return counter.seq;
};

/**
 * Invoice Item Sub-Schema
 */
const invoiceItemSchema = new mongoose.Schema(
  {
    description: {
      type: String,
      required: [true, 'Item description is required'],
      trim: true,
      maxlength: [300, 'Description cannot exceed 300 characters']
    },
    quantity: {
      type: Number,
      required: [true, 'Item quantity is required'],
      min: [1, 'Quantity must be at least 1'],
      default: 1
    },
    unitPrice: {
      type: Number,
      required: [true, 'Unit price is required'],
      min: [0, 'Unit price cannot be negative']
    },
    amount: {
      type: Number,
      required: true,
      min: [0, 'Item total amount cannot be negative']
    }
  },
  { _id: true }
);

/**
 * Main Invoice Schema
 */
const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: [true, 'Invoice number is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: [true, 'Client ID is required'],
      index: true
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClientSubscription',
      default: null,
      index: true
    },
    invoiceType: {
      type: String,
      enum: Object.values(InvoiceType),
      default: InvoiceType.NEW_PLAN,
      index: true
    },
    paymentTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentTransaction',
      default: null
    },
    items: {
      type: [invoiceItemSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'Invoice must contain at least one line item'
      }
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
      trim: true
    },
    subtotal: {
      type: Number,
      required: true,
      min: [0, 'Subtotal cannot be negative']
    },
    taxPercentage: {
      type: Number,
      default: 18,
      min: [0, 'Tax percentage cannot be negative']
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: [0, 'Tax amount cannot be negative']
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: [0, 'Discount amount cannot be negative']
    },
    totalAmount: {
      type: Number,
      required: true,
      min: [0, 'Total amount cannot be negative']
    },
    amountPaid: {
      type: Number,
      default: 0,
      min: [0, 'Paid amount cannot be negative']
    },
    amountDue: {
      type: Number,
      default: 0,
      min: [0, 'Amount due cannot be negative']
    },
    status: {
      type: String,
      enum: {
        values: Object.values(InvoiceStatus),
        message: 'Invalid invoice status'
      },
      default: InvoiceStatus.UNPAID,
      required: true,
      index: true
    },
    issueDate: {
      type: Date,
      default: Date.now,
      required: true
    },
    dueDate: {
      type: Date,
      required: [true, 'Due date is required'],
      index: true
    },
    paidAt: {
      type: Date,
      default: null
    },
    pdfStatus: {
      type: String,
      enum: Object.values(PdfStatus),
      default: PdfStatus.PENDING,
      index: true
    },
    pdfUrl: {
      type: String,
      trim: true,
      default: null
    },
    pdfFailureReason: {
      type: String,
      default: null
    },
    pdfGeneratedAt: {
      type: Date,
      default: null
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
      default: ''
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
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

invoiceSchema.pre('validate', function (next) {
  if (this.items && this.items.length > 0) {
    this.items.forEach((item) => {
      item.amount = (item.quantity || 1) * (item.unitPrice || 0);
    });

    this.subtotal = this.items.reduce((sum, item) => sum + item.amount, 0);
    this.taxAmount = (this.subtotal * (this.taxPercentage || 0)) / 100;
    this.totalAmount = Math.max(0, this.subtotal + this.taxAmount - (this.discountAmount || 0));
    this.amountDue = Math.max(0, this.totalAmount - (this.amountPaid || 0));
  }
  next();
});

invoiceSchema.index({ clientId: 1, createdAt: -1 });
invoiceSchema.index({ status: 1, dueDate: 1 });

export const InvoiceModel =
  mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);
