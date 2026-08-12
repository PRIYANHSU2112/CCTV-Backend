import { BaseController } from '../../shared/bases/base.controller.js';
import { Messages } from '../../shared/constants/messages.constant.js';

export class PaymentController extends BaseController {
  constructor({ paymentService, checkoutService }) {
    super();
    this.paymentService = paymentService;
    this.checkoutService = checkoutService;
  }

  recordPayment = this.catchAsync(async (req, res) => {
    const result = await this.paymentService.recordPayment({
      ...req.body,
      recordedBy: req.user?.id,
    });
    return this.sendCreated(res, result, 'Payment recorded successfully');
  });

  listPayments = this.catchAsync(async (req, res) => {
    const { items, page, limit, total } = await this.paymentService.listPayments(
      req.query,
    );
    return this.sendPaginated(res, items, page, limit, total, Messages.FETCHED);
  });

  getPaymentSummary = this.catchAsync(async (req, res) => {
    const summary = await this.paymentService.getPaymentSummary();
    return this.sendResponse(res, summary, Messages.FETCHED);
  });

  getPaymentById = this.catchAsync(async (req, res) => {
    const payment = await this.paymentService.getPaymentById(req.params.id);
    return this.sendResponse(res, payment, Messages.FETCHED);
  });

  listClientPayments = this.catchAsync(async (req, res) => {
    const { items, page, limit, total } =
      await this.paymentService.listClientPayments(req.params.clientId, req.query);
    return this.sendPaginated(res, items, page, limit, total, Messages.FETCHED);
  });

  getGatewayConfig = this.catchAsync(async (req, res) => {
    const config = this.checkoutService.getGatewayConfig();
    return this.sendResponse(res, config, Messages.FETCHED);
  });

  createCheckoutSession = this.catchAsync(async (req, res) => {
    const result = await this.checkoutService.createCheckoutSession(req.body);
    return this.sendCreated(res, result, 'Checkout session created successfully');
  });

  verifyCheckout = this.catchAsync(async (req, res) => {
    const result = await this.checkoutService.verifyCheckoutPayment(req.body);
    return this.sendResponse(res, result, 'Payment verified successfully');
  });

  failCheckout = this.catchAsync(async (req, res) => {
    const result = await this.checkoutService.failCheckout(req.body);
    return this.sendResponse(res, result, 'Checkout marked as failed');
  });

  getCheckoutSession = this.catchAsync(async (req, res) => {
    const result = await this.checkoutService.getCheckoutSession(
      req.params.sessionId,
    );
    return this.sendResponse(res, result, Messages.FETCHED);
  });

  razorpayWebhook = this.catchAsync(async (req, res) => {
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const signature = req.headers['x-razorpay-signature'];
    const result = await this.checkoutService.handleRazorpayWebhook(
      rawBody,
      signature,
    );
    return this.sendResponse(res, result, 'Webhook processed');
  });
}
