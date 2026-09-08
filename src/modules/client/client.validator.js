import Joi from 'joi';
import { PackageTier, BillingCycle, ClientStatus, CameraStatus } from '../../shared/constants/enum.constant.js';
import { GSTIN_REGEX } from '../../shared/utils/gstin.util.js';

const gstinField = Joi.alternatives()
  .try(
    Joi.valid('', null),
    Joi.string().trim().uppercase().length(15).pattern(GSTIN_REGEX).messages({
      'string.length': 'GSTIN must be exactly 15 characters',
      'string.pattern.base': 'Please provide a valid 15-character GSTIN number',
    }),
  )
  .optional();

export const createClientSchema = Joi.object({
  // Contact Person & User Auth fields
  name: Joi.string().min(2).max(100).required().messages({
    'string.empty': 'Contact person name is required'
  }),
  phone: Joi.string().pattern(/^[0-9+\s-]{8,15}$/).required().messages({
    'string.empty': 'Mobile phone number is required for user login',
    'string.pattern.base': 'Please enter a valid phone number'
  }),
  email: Joi.string().email().optional().allow('', null),
  password: Joi.string().min(6).optional().allow('', null),

  // Client Business & Installation Profile
  businessName: Joi.string().min(2).max(150).required().messages({
    'string.empty': 'Business name is required'
  }),
  gstin: gstinField,
  address: Joi.string().min(5).required().messages({
    'string.empty': 'Installation street address is required'
  }),
  city: Joi.string().min(2).required().messages({
    'string.empty': 'City is required'
  }),
  pincode: Joi.string().pattern(/^[0-9]{6}$/).required().messages({
    'string.empty': 'Pincode is required',
    'string.pattern.base': 'Pincode must be 6 digits'
  }),
  state: Joi.string().default('Madhya Pradesh'),

  // Package & Billing Setup — prefer planId from Admin plans list
  planId: Joi.string().hex().length(24).optional(),
  packageTier: Joi.string().valid(...Object.values(PackageTier)).default(PackageTier.BASIC),
  billingCycle: Joi.string().valid(...Object.values(BillingCycle)).default(BillingCycle.MONTHLY),
  monthlyCharge: Joi.number().positive().optional(),
  cameras: Joi.number().integer().min(1).optional(),
  packageName: Joi.string().trim().allow('', null),
  contractStart: Joi.date().iso().optional().allow('', null),
  renewalDate: Joi.date().iso().optional().allow('', null),
  autoRenew: Joi.boolean().default(true),
  applyInstallationCharge: Joi.boolean().optional(),
  installationCharge: Joi.number().min(0).optional().allow(null),
  installationGst: Joi.number().min(0).optional().allow(null),
  installationHsnSac: Joi.string().trim().optional().allow('', null),
}).unknown(true);

export const updateClientSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  phone: Joi.string().pattern(/^[0-9+\s-]{8,15}$/).optional(),
  email: Joi.string().email().optional().allow('', null),
  businessName: Joi.string().min(2).max(150).optional(),
  gstin: gstinField,
  address: Joi.string().min(5).optional(),
  city: Joi.string().min(2).optional(),
  pincode: Joi.string().pattern(/^[0-9]{6}$/).optional(),
  state: Joi.string().optional(),
  status: Joi.string().valid(...Object.values(ClientStatus)).optional()
}).unknown(true);

export const addCameraSchema = Joi.object({
  location: Joi.string().min(2).required().messages({
    'string.empty': 'Camera location is required (e.g., Main Gate, Lobby)'
  }),
  ipAddress: Joi.string().ip().optional().allow('', null),
  serialNumber: Joi.string().optional().allow('', null),
  status: Joi.string().valid(...Object.values(CameraStatus)).default(CameraStatus.ONLINE)
});

export const updateClientStatusSchema = Joi.object({
  status: Joi.string()
    .valid(
      ...Object.values(ClientStatus),
      'ACTIVE',
      'SUSPENDED',
      'APPROACH_CLIENT',
      'DUE',
      'OVERDUE'
    )
    .required()
    .messages({
      'any.required': 'Client status is required'
    })
});

export const getClientByIdSchema = Joi.object({
  id: Joi.string().required()
});

export const queryClientsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().allow('', null),
  city: Joi.string().trim().allow('', null),
  status: Joi.string().valid(...Object.values(ClientStatus)).allow('', null),
  hasSubscription: Joi.boolean().optional().allow('', null),
  sortBy: Joi.string().valid('createdAt', 'businessName', 'status', 'totalCamerasInstalled').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});
