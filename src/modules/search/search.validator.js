import Joi from 'joi';

export const globalSearchSchema = Joi.object({
  q: Joi.string().trim().min(1).max(100).required().messages({
    'string.empty': 'Search query cannot be empty',
    'string.min': 'Search query must be at least 1 character',
    'string.max': 'Search query cannot exceed 100 characters',
    'any.required': 'Search query param (q) is required',
  }),
  limit: Joi.number().integer().min(1).max(20).default(5).optional(),
  type: Joi.string().trim().valid('all', 'clients', 'invoices', 'payments', 'subscriptions', 'users').default('all').optional(),
});
