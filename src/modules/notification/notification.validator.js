import Joi from 'joi';

export const sendNotificationSchema = Joi.object({
  recipient: Joi.string().required().messages({ 'any.required': 'Recipient User ID is required' }),
  title: Joi.string().min(1).max(150).required().messages({ 'any.required': 'Notification title is required' }),
  message: Joi.string().min(1).max(1000).required().messages({ 'any.required': 'Notification message is required' }),
  type: Joi.string().valid('SYSTEM', 'PAYMENT', 'SUBSCRIPTION', 'INVOICE', 'REMINDER', 'SECURITY', 'ALERT').optional(),
  priority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL').optional(),
  channel: Joi.string().valid('IN_APP', 'EMAIL', 'SMS', 'PUSH').optional(),
  actionUrl: Joi.string().allow('', null).optional(),
  metadata: Joi.object().optional()
});

export const broadcastNotificationSchema = Joi.object({
  recipientIds: Joi.array().items(Joi.string()).min(1).required().messages({ 'array.min': 'At least one recipient is required' }),
  title: Joi.string().min(1).max(150).required(),
  message: Joi.string().min(1).max(1000).required(),
  type: Joi.string().valid('SYSTEM', 'PAYMENT', 'SUBSCRIPTION', 'INVOICE', 'REMINDER', 'SECURITY', 'ALERT').optional(),
  priority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL').optional(),
  channel: Joi.string().valid('IN_APP', 'EMAIL', 'SMS', 'PUSH').optional(),
  actionUrl: Joi.string().allow('', null).optional(),
  metadata: Joi.object().optional()
});

export const getNotificationsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
  isRead: Joi.string().valid('true', 'false').optional()
});
