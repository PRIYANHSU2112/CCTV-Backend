import crypto from 'crypto';
import { RazorpayService } from '../../modules/payment/razorpay.service.js';
import { BadRequestError } from '../../shared/errors/bad-request.error.js';

describe('RazorpayService', () => {
  let service;

  beforeEach(() => {
    service = new RazorpayService();
    service.keyId = 'rzp_test_key';
    service.keySecret = 'test_secret_key_123';
    service.webhookSecret = 'whsec_test';
    service.client = {
      orders: {
        create: async () => ({ id: 'order_abc', amount: 10000 }),
      },
    };
  });

  it('verifies valid payment signature', () => {
    const orderId = 'order_abc';
    const paymentId = 'pay_xyz';
    const signature = crypto
      .createHmac('sha256', 'test_secret_key_123')
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    expect(
      service.verifyPaymentSignature({ orderId, paymentId, signature }),
    ).toBe(true);
  });

  it('rejects invalid payment signature', () => {
    expect(() =>
      service.verifyPaymentSignature({
        orderId: 'order_abc',
        paymentId: 'pay_xyz',
        signature: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      }),
    ).toThrow(BadRequestError);
  });

  it('getPublicConfig never returns secret', () => {
    const cfg = service.getPublicConfig();
    expect(cfg.keyId).toBe('rzp_test_key');
    expect(Object.keys(cfg)).not.toContain('keySecret');
  });
});
