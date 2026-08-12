import { Router } from 'express';
import { validateRequest } from '../../shared/middlewares/validate.middleware.js';
import {
  createInvoiceSchema,
  queryInvoicesSchema,
  getInvoiceByIdSchema,
  updateInvoiceStatusSchema,
  recordInvoicePaymentSchema
} from './invoice.validator.js';

export const createInvoiceRouter = (invoiceController) => {
  const router = Router();

  router.post('/', validateRequest(createInvoiceSchema), invoiceController.createInvoice);
  router.get('/', validateRequest(queryInvoicesSchema, 'query'), invoiceController.listInvoices);
  router.get('/:id', validateRequest(getInvoiceByIdSchema, 'params'), invoiceController.getInvoiceById);
  router.get('/:id/pdf/status', validateRequest(getInvoiceByIdSchema, 'params'), invoiceController.getInvoicePdfStatus);
  router.get('/:id/pdf', validateRequest(getInvoiceByIdSchema, 'params'), invoiceController.downloadInvoicePdf);
  router.post('/:id/email', validateRequest(getInvoiceByIdSchema, 'params'), invoiceController.emailInvoice);
  router.patch('/:id/status', validateRequest(getInvoiceByIdSchema, 'params'), validateRequest(updateInvoiceStatusSchema), invoiceController.updateInvoiceStatus);
  router.post('/:id/payments', validateRequest(getInvoiceByIdSchema, 'params'), validateRequest(recordInvoicePaymentSchema), invoiceController.recordInvoicePayment);

  return router;
};
