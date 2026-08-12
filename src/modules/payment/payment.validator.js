import Joi from 'joi';
import { PaymentMethod, PaymentStatus } from '../../shared/constants/enum.constant.js';

const objectId = Joi.string().hex().length(24);

export const createPaymentSchema = Joi.object({
  clientId: objectId.required().messages({
    'any.required': 'Client ID is required',
    'string.hex': 'Client ID must be a valid MongoDB ObjectId',
    'string.length': 'Client ID must be a valid MongoDB ObjectId',
  }),
  amount: Joi.number().positive().required().messages({
    'number.positive': 'Amount must be greater than zero',
    'any.required': 'Amount is required',
  }),
  method: Joi.string()
    .valid(...Object.values(PaymentMethod))
    .required()
    .messages({
      'any.only': 'Invalid payment method (Must be UPI, BANK_TRANSFER, CASH, or GATEWAY)',
    }),
  status: Joi.string()
    .valid(...Object.values(PaymentStatus))
    .default(PaymentStatus.PAID),
  paidAt: Joi.date().iso().optional().allow(null),
  invoiceId: Joi.string().trim().max(64).optional().allow('', null),
  note: Joi.string().trim().max(500).optional().allow('', null),
  subscriptionId: objectId.optional().allow(null),
}).prefs({ convert: true });

export const queryPaymentsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().allow('', null),
  method: Joi.string()
    .valid(...Object.values(PaymentMethod), 'all', '')
    .allow(null),
  status: Joi.string()
    .valid(...Object.values(PaymentStatus), 'all', '')
    .allow(null),
  clientId: Joi.alternatives()
    .try(objectId, Joi.valid('', null))
    .optional(),
  from: Joi.alternatives().try(Joi.date().iso(), Joi.valid('', null)).optional(),
  to: Joi.alternatives().try(Joi.date().iso(), Joi.valid('', null)).optional(),
  sortBy: Joi.string().valid('paidAt', 'amount', 'createdAt', 'status').default('paidAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
}).prefs({ convert: true });

export const getPaymentByIdSchema = Joi.object({
  id: objectId.required(),
});

export const getClientPaymentsSchema = Joi.object({
  clientId: objectId.required(),
});

export const createCheckoutSessionSchema = Joi.object({
  planId: objectId.required().messages({
    'any.required': 'Plan ID is required',
  }),
  name: Joi.string().trim().min(2).max(100).required(),
  phone: Joi.string()
    .pattern(/^[0-9+\s-]{8,15}$/)
    .required(),
  email: Joi.string().email().optional().allow('', null),
  businessName: Joi.string().trim().min(2).max(150).required(),
  address: Joi.string().trim().min(5).required(),
  city: Joi.string().trim().min(2).required(),
  pincode: Joi.string().pattern(/^[0-9]{6}$/).required(),
  gstin: Joi.string().trim().allow('', null),
  state: Joi.string().trim().default('Madhya Pradesh'),
}).prefs({ convert: true });

export const verifyCheckoutSchema = Joi.object({
  sessionId: Joi.string().trim().min(16).max(64).required(),
  razorpay_order_id: Joi.string().trim().required(),
  razorpay_payment_id: Joi.string().trim().required(),
  razorpay_signature: Joi.string().trim().required(),
}).prefs({ convert: true });

export const failCheckoutSchema = Joi.object({
  sessionId: Joi.string().trim().min(16).max(64).required(),
  reason: Joi.string().trim().max(500).optional().allow('', null),
}).prefs({ convert: true });

export const getCheckoutSessionSchema = Joi.object({
  sessionId: Joi.string().trim().min(16).max(64).required(),
});
