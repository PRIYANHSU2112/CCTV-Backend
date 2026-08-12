import Joi from 'joi';
import { UserRole, UserStatus } from '../../shared/constants/enum.constant.js';

export const createUserSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    'string.empty': 'Full name cannot be empty',
    'string.min': 'Name must be at least 2 characters'
  }),
  phone: Joi.string().pattern(/^[0-9+\s-]{8,15}$/).optional().allow('', null).messages({
    'string.pattern.base': 'Please enter a valid phone number'
  }),
  username: Joi.string().alphanum().min(3).max(30).optional().allow('', null).messages({
    'string.min': 'Username must be at least 3 characters long'
  }),
  email: Joi.string().email().optional().allow('', null).messages({
    'string.email': 'Must be a valid email address'
  }),
  password: Joi.string().min(6).max(100).required().messages({
    'string.min': 'Password must be at least 6 characters long'
  }),
  // Accept system roles AND any custom role stored in the DB (e.g. SUB_ADMIN, BILLING_MANAGER)
  role: Joi.string().min(2).max(50).uppercase().default(UserRole.CLIENT),
  status: Joi.string().valid(...Object.values(UserStatus)).default(UserStatus.ACTIVE)
});

export const mobileLoginSchema = Joi.object({
  phone: Joi.string().required().messages({
    'any.required': 'Mobile phone number is required'
  }),
  password: Joi.string().required().messages({
    'any.required': 'Password is required'
  })
});

export const sendOtpSchema = Joi.object({
  phone: Joi.string().pattern(/^[0-9+\s-]{8,15}$/).required().messages({
    'string.empty': 'Phone number is required',
    'string.pattern.base': 'Please enter a valid phone number'
  })
});

export const otpLoginSchema = Joi.object({
  phone: Joi.string().pattern(/^[0-9+\s-]{8,15}$/).required().messages({
    'string.empty': 'Phone number is required',
    'string.pattern.base': 'Please enter a valid phone number'
  }),
  otp: Joi.string().required().messages({
    'any.required': 'OTP is required'
  })
});

export const adminLoginSchema = Joi.object({
  username: Joi.string().required().messages({
    'any.required': 'Username or Email is required'
  }),
  password: Joi.string().required().messages({
    'any.required': 'Password is required'
  })
});

export const unifiedLoginSchema = Joi.object({
  identifier: Joi.string().required().messages({
    'any.required': 'Identifier (Phone, Username, or Email) is required'
  }),
  password: Joi.string().required().messages({
    'any.required': 'Password is required'
  })
});

export const updateUserSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  phone: Joi.string().pattern(/^[0-9+\s-]{8,15}$/).optional().allow('', null),
  username: Joi.string().alphanum().min(3).max(30).optional().allow('', null),
  email: Joi.string().email().optional().allow('', null),
  // Accept system roles AND custom DB-stored roles
  role: Joi.string().min(2).max(50).uppercase().optional(),
  status: Joi.string().valid(...Object.values(UserStatus)).optional()
});

export const updateStatusSchema = Joi.object({
  status: Joi.string().valid(...Object.values(UserStatus)).required().messages({
    'any.required': 'Status is required'
  })
});

export const getUserByIdSchema = Joi.object({
  id: Joi.string().required()
});

export const queryUserSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().allow('', null),
  role: Joi.string().valid(...Object.values(UserRole), 'all').allow('', null),
  status: Joi.string().valid(...Object.values(UserStatus), 'all').allow('', null),
  staffOnly: Joi.boolean().default(true),
  sortBy: Joi.string().valid('createdAt', 'name', 'phone', 'email', 'role', 'status').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});
