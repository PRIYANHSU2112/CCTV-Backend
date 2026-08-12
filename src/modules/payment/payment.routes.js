import { Router } from 'express';
import { validateRequest } from '../../shared/middlewares/validate.middleware.js';
import {
  createPaymentSchema,
  queryPaymentsSchema,
  getPaymentByIdSchema,
  getClientPaymentsSchema,
  createCheckoutSessionSchema,
  verifyCheckoutSchema,
  failCheckoutSchema,
  getCheckoutSessionSchema,
} from './payment.validator.js';

export const createPaymentRouter = (paymentController) => {
  const router = Router();

  // --- Razorpay checkout (public) ---
  router.get('/gateway/config', paymentController.getGatewayConfig);
  router.post(
    '/checkout/sessions',
    validateRequest(createCheckoutSessionSchema),
    paymentController.createCheckoutSession,
  );
  router.post(
    '/checkout/verify',
    validateRequest(verifyCheckoutSchema),
    paymentController.verifyCheckout,
  );
  router.post(
    '/checkout/fail',
    validateRequest(failCheckoutSchema),
    paymentController.failCheckout,
  );
  router.get(
    '/checkout/sessions/:sessionId',
    validateRequest(getCheckoutSessionSchema, 'params'),
    paymentController.getCheckoutSession,
  );
  router.post('/webhooks/razorpay', paymentController.razorpayWebhook);

  // --- Admin ledger ---
  router.post('/', validateRequest(createPaymentSchema), paymentController.recordPayment);
  router.get('/', validateRequest(queryPaymentsSchema, 'query'), paymentController.listPayments);
  router.get('/summary', paymentController.getPaymentSummary);
  router.get(
    '/clients/:clientId',
    validateRequest(getClientPaymentsSchema, 'params'),
    validateRequest(queryPaymentsSchema, 'query'),
    paymentController.listClientPayments,
  );
  router.get(
    '/:id',
    validateRequest(getPaymentByIdSchema, 'params'),
    paymentController.getPaymentById,
  );

  return router;
};
