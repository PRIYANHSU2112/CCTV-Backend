import Joi from 'joi';

export const createReminderSchema = Joi.object({
  title: Joi.string().trim().min(3).max(150).required(),
  clientId: Joi.string().hex().length(24).optional().allow(null),
  subscriptionId: Joi.string().hex().length(24).optional().allow(null),
  channels: Joi.array().items(Joi.string().valid('SMS', 'WhatsApp', 'Email', 'Push')).min(1).required(),
  messageTemplate: Joi.string().trim().max(1000).required(),
  isRecurring: Joi.boolean().default(false),
  repeatEveryDays: Joi.number().integer().min(1).optional().allow(null),
  cronExpression: Joi.string().trim().optional().allow(null, ''),
  scheduledFor: Joi.date().iso().required()
});

export const updateReminderSchema = Joi.object({
  title: Joi.string().trim().min(3).max(150).optional(),
  channels: Joi.array().items(Joi.string().valid('SMS', 'WhatsApp', 'Email', 'Push')).optional(),
  messageTemplate: Joi.string().trim().max(1000).optional(),
  isRecurring: Joi.boolean().optional(),
  repeatEveryDays: Joi.number().integer().min(1).optional().allow(null),
  cronExpression: Joi.string().trim().optional().allow(null, ''),
  scheduledFor: Joi.date().iso().optional()
});

export const queryRemindersSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  status: Joi.string().trim().optional(),
  channel: Joi.string().trim().optional(),
  search: Joi.string().trim().optional().allow('')
});
