import Joi from 'joi';
import { PackageTier, BillingCycle, PlanStatus, SubscriptionStatus } from '../../shared/constants/enum.constant.js';

export const createPlanSchema = Joi.object({
  name: Joi.string().min(3).max(100).required().messages({
    'string.empty': 'Plan name cannot be empty',
    'string.min': 'Plan name must be at least 3 characters'
  }),
  planCode: Joi.string()
    .trim()
    .uppercase()
    .pattern(/^[A-Z0-9][A-Z0-9_-]{2,29}$/)
    .optional()
    .allow('', null)
    .messages({
      'string.pattern.base':
        'Plan code must be 3–30 chars: letters, numbers, underscore or hyphen (e.g. STD_8CAM_MONTHLY)',
    }),
  description: Joi.string().trim().max(500).optional().allow('', null),
  packageTier: Joi.string().valid(...Object.values(PackageTier)).required().messages({
    'any.only': 'Invalid package tier (Must be BASIC, STANDARD, PREMIUM, or ENTERPRISE)'
  }),
  billingCycle: Joi.string().valid(...Object.values(BillingCycle)).required().messages({
    'any.only': 'Invalid billing cycle (Must be MONTHLY, QUARTERLY, HALF_YEARLY, or YEARLY)'
  }),
  durationInMonths: Joi.number().integer().min(1).max(48).optional(),
  activationMonths: Joi.number().integer().min(1).max(48).optional(),
  basePrice: Joi.number().positive().required().messages({
    'number.positive': 'Base price must be a positive number'
  }),
  gstPercentage: Joi.number().min(0).max(28).default(18),
  maxCameras: Joi.number().integer().min(1).required().messages({
    'number.min': 'Max cameras must be at least 1'
  }),
  features: Joi.array().items(Joi.string().trim()).default([]),
  autoRenewalSupported: Joi.boolean().default(true),
  status: Joi.string().valid(...Object.values(PlanStatus)).default(PlanStatus.ACTIVE)
});

export const updatePlanSchema = Joi.object({
  name: Joi.string().min(3).max(100).optional(),
  planCode: Joi.string().trim().uppercase().optional(),
  description: Joi.string().trim().max(500).optional().allow('', null),
  packageTier: Joi.string().valid(...Object.values(PackageTier)).optional(),
  billingCycle: Joi.string().valid(...Object.values(BillingCycle)).optional(),
  durationInMonths: Joi.number().integer().min(1).max(48).optional(),
  activationMonths: Joi.number().integer().min(1).max(48).optional(),
  basePrice: Joi.number().positive().optional(),
  gstPercentage: Joi.number().min(0).max(28).optional(),
  maxCameras: Joi.number().integer().min(1).optional(),
  features: Joi.array().items(Joi.string().trim()).optional(),
  autoRenewalSupported: Joi.boolean().optional(),
  status: Joi.string().valid(...Object.values(PlanStatus)).optional()
});

export const assignSubscriptionSchema = Joi.object({
  clientId: Joi.string().required().messages({
    'any.required': 'Client ID is required'
  }),
  planId: Joi.string().required().messages({
    'any.required': 'Plan ID is required'
  }),
  cameraCount: Joi.number().integer().min(1).optional(),
  contractStartDate: Joi.date().iso().default(() => new Date()),
  autoRenewal: Joi.boolean().default(true)
});

export const renewSubscriptionSchema = Joi.object({
  subscriptionId: Joi.string().required().messages({
    'any.required': 'Subscription ID is required'
  }),
  monthsToExtend: Joi.number().integer().min(1).max(48).optional()
});

export const updateSubscriptionStatusSchema = Joi.object({
  subscriptionId: Joi.string().required().messages({
    'any.required': 'Subscription ID is required'
  }),
  status: Joi.string().valid(...Object.values(SubscriptionStatus)).required().messages({
    'any.only': 'Invalid subscription status'
  })
});

export const updateAutoRenewSchema = Joi.object({
  autoRenewal: Joi.boolean().required()
});

export const queryPlansSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().allow('', null),
  packageTier: Joi.string().valid(...Object.values(PackageTier), 'all').allow('', null),
  billingCycle: Joi.string().valid(...Object.values(BillingCycle), 'all').allow('', null),
  status: Joi.string().valid(...Object.values(PlanStatus), 'all').allow('', null),
  sortBy: Joi.string().valid('createdAt', 'name', 'basePrice', 'totalPrice', 'maxCameras').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

export const queryClientSubscriptionsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().allow('', null),
  status: Joi.string().valid(...Object.values(SubscriptionStatus), 'all').allow('', null),
  packageTier: Joi.string().valid(...Object.values(PackageTier), 'all').allow('', null),
  billingCycle: Joi.string().valid(...Object.values(BillingCycle), 'all').allow('', null),
  sortBy: Joi.string().valid('createdAt', 'renewalDate', 'monthlyCharge').default('renewalDate'),
  sortOrder: Joi.string().valid('asc', 'desc').default('asc')
});
