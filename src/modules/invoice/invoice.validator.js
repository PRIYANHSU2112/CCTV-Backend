import Joi from 'joi';

export const createInvoiceSchema = Joi.object({
  clientId: Joi.string().hex().length(24).required(),
  subscriptionId: Joi.string().hex().length(24).optional().allow(null),
  dueDate: Joi.date().iso().optional().allow(null),
  taxPercentage: Joi.number().min(0).max(100).default(18),
  discountAmount: Joi.number().min(0).default(0),
  items: Joi.array()
    .items(
      Joi.object({
        description: Joi.string().trim().max(300).required(),
        quantity: Joi.number().integer().min(1).default(1),
        unitPrice: Joi.number().min(0).required(),
        hsnSac: Joi.string().trim().max(10).default('998529').optional().allow('', null)
      })
    )
    .optional()
    .allow(null),
  notes: Joi.string().trim().max(1000).optional().allow('')
});

export const queryInvoicesSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  clientId: Joi.string().trim().allow('', 'all', null).optional(),
  status: Joi.string().trim().allow('', 'all', null).optional(),
  search: Joi.string().trim().allow('', null).optional()
}).prefs({ convert: true, stripUnknown: true });

export const getInvoiceByIdSchema = Joi.object({
  id: Joi.string().trim().required()
});

export const updateInvoiceStatusSchema = Joi.object({
  status: Joi.string().required(),
  paidAmount: Joi.number().min(0).optional()
});

export const recordInvoicePaymentSchema = Joi.object({
  amountPaid: Joi.number().positive().required(),
  paymentMethod: Joi.string().trim().default('Cash'),
  notes: Joi.string().trim().max(500).optional().allow('')
});
