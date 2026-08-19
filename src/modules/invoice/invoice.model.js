import mongoose from 'mongoose';
import { getFullPdfUrl } from '../../config/env.config.js';
import { roundMoney } from '../../shared/utils/money.util.js';

/**
 * Invoice Status Enum
 */
export const InvoiceStatus = Object.freeze({
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  ISSUED: 'ISSUED',
  UNPAID: 'UNPAID',
  PAID: 'PAID',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  OVERDUE: 'OVERDUE',
  CANCELLED: 'CANCELLED',
  VOID: 'VOID',
  PENDING: 'PENDING'
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
    hsnSac: {
      type: String,
      trim: true,
      default: '998529',
      maxlength: [10, 'HSN/SAC code cannot exceed 10 characters']
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
    // Explicit CGST/SGST/IGST storage — never recalculated in the PDF template
    cgstAmount: {
      type: Number,
      default: 0,
      min: [0, 'CGST amount cannot be negative']
    },
    sgstAmount: {
      type: Number,
      default: 0,
      min: [0, 'SGST amount cannot be negative']
    },
    igstAmount: {
      type: Number,
      default: 0,
      min: [0, 'IGST amount cannot be negative']
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

/**
 * Pre-validate hook — computes item amounts and invoice totals.
 *
 * IMPORTANT: If the caller has already set taxAmount, cgstAmount, sgstAmount,
 * totalAmount explicitly, this hook respects those values and only fills in
 * missing fields. This prevents the double-tax bug where a GST-inclusive
 * amount gets taxed again.
 */
invoiceSchema.pre('validate', function (next) {
  if (this.items && this.items.length > 0) {
    // Always recompute item-level amounts from unitPrice × quantity
    this.items.forEach((item) => {
      if (!item.hsnSac || !item.hsnSac.trim()) {
        item.hsnSac = '998529';
      }
      item.amount = roundMoney((item.quantity || 1) * (item.unitPrice || 0));
    });

    // Subtotal = sum of all item amounts
    this.subtotal = roundMoney(this.items.reduce((sum, item) => sum + item.amount, 0));

    // Only compute tax fields if the caller has NOT explicitly provided them
    const callerSetTax = (this.taxAmount > 0) || (this.cgstAmount > 0) || (this.sgstAmount > 0) || (this.igstAmount > 0);
    if (!callerSetTax && this.subtotal > 0) {
      const rate = this.taxPercentage || 0;
      this.taxAmount = roundMoney((this.subtotal * rate) / 100);
      this.cgstAmount = roundMoney(Math.floor(this.taxAmount * 100 / 2) / 100);
      this.sgstAmount = roundMoney(this.taxAmount - this.cgstAmount);
      this.igstAmount = 0;
    }

    // Total = subtotal + tax - discount
    this.totalAmount = roundMoney(
      Math.max(0, this.subtotal + (this.taxAmount || 0) - (this.discountAmount || 0))
    );

    // Amount due = total - paid
    this.amountDue = roundMoney(Math.max(0, this.totalAmount - (this.amountPaid || 0)));
  }

  // Convert relative paths to full cloud URLs
  if (this.pdfUrl && typeof this.pdfUrl === 'string' && this.pdfUrl.startsWith('/uploads/')) {
    this.pdfUrl = getFullPdfUrl(this.pdfUrl);
  }

  next();
});

invoiceSchema.index({ clientId: 1, createdAt: -1 });
invoiceSchema.index({ status: 1, dueDate: 1 });

export const InvoiceModel =
  mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);
