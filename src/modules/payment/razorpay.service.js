import crypto from 'crypto';
import Razorpay from 'razorpay';
import { env } from '../../config/env.config.js';
import { BadRequestError } from '../../shared/errors/bad-request.error.js';

export class RazorpayService {
  constructor() {
    this.keyId = env.RAZORPAY_KEY_ID;
    this.keySecret = env.RAZORPAY_KEY_SECRET;
    this.webhookSecret = env.RAZORPAY_WEBHOOK_SECRET;
    this.client =
      this.keyId && this.keySecret
        ? new Razorpay({ key_id: this.keyId, key_secret: this.keySecret })
        : null;
  }

  assertConfigured() {
    if (!this.client || !this.keyId || !this.keySecret) {
      throw new BadRequestError('Razorpay is not configured on the server');
    }
  }

  getPublicConfig() {
    this.assertConfigured();
    return {
      keyId: this.keyId,
      currency: 'INR',
    };
  }

  async createOrder({ amountPaise, currency = 'INR', receipt, notes = {} }) {
    this.assertConfigured();
    try {
      const order = await this.client.orders.create({
        amount: amountPaise,
        currency,
        receipt: String(receipt).slice(0, 40),
        notes,
      });
      return order;
    } catch (err) {
      const desc =
        err?.error?.description ||
        err?.error?.message ||
        err?.message ||
        'Payment gateway order creation failed';

      // If Razorpay API rejects credentials (401 Authentication failed), wrap as a clear descriptive error
      // so client does not mistake it for a user authentication / JWT session failure
      if (
        err?.statusCode === 401 ||
        (err?.error?.code === 'BAD_REQUEST_ERROR' && /auth/i.test(desc))
      ) {
        throw new BadRequestError(
          `Razorpay Gateway Authentication Failed: Invalid Key ID or Secret (${desc}). Please verify RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in server environment.`
        );
      }
      throw new BadRequestError(`Payment gateway error: ${desc}`);
    }
  }

  verifyPaymentSignature({ orderId, paymentId, signature }) {
    this.assertConfigured();
    const body = `${orderId}|${paymentId}`;
    const expected = crypto
      .createHmac('sha256', this.keySecret)
      .update(body)
      .digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(String(signature || ''));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new BadRequestError('Invalid Razorpay payment signature');
    }
    return true;
  }

  verifyWebhookSignature(rawBody, signatureHeader) {
    if (!this.webhookSecret) {
      throw new BadRequestError('Razorpay webhook secret is not configured');
    }
    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(String(signatureHeader || ''));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new BadRequestError('Invalid Razorpay webhook signature');
    }
    return true;
  }
}
