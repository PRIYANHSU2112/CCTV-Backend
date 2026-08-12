import Joi from 'joi';
import { Permissions } from '../../shared/constants/permissions.constant.js';

export const createRoleSchema = Joi.object({
  name: Joi.string().min(2).max(50).required().messages({
    'string.empty': 'Role name cannot be empty',
    'string.min': 'Role name must be at least 2 characters long'
  }),
  description: Joi.string().max(255).optional().allow('', null),
  permissions: Joi.array().items(
    Joi.string().valid(...Object.values(Permissions))
  ).default([]),
  hierarchy: Joi.number().integer().min(1).max(99).default(20)
});

export const updateRoleSchema = Joi.object({
  description: Joi.string().max(255).optional().allow('', null),
  permissions: Joi.array().items(
    Joi.string().valid(...Object.values(Permissions))
  ).optional()
});

export const getRoleByIdSchema = Joi.object({
  id: Joi.string().required()
});

export const queryAuditLogSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().allow('', null),
  action: Joi.string().trim().allow('', null),
  targetType: Joi.string().trim().allow('', null)
});
