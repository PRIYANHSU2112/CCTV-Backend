import { jest } from '@jest/globals';
import { PostPaymentQueueService, ADMIN_NOTIFICATION_QUEUE, INVOICE_PIPELINE_QUEUE } from '../../shared/queues/post-payment-queue.service.js';

describe('PostPaymentQueueService (Unit Tests)', () => {
  let postPaymentQueueService;
  let mockRedisClient;
  let mockQueueInstance;

  beforeEach(() => {
    mockQueueInstance = {
      add: jest.fn().mockResolvedValue({ id: 'job_123' }),
      close: jest.fn().mockResolvedValue()
    };

    mockRedisClient = {
      duplicate: jest.fn().mockReturnValue({})
    };

    postPaymentQueueService = new PostPaymentQueueService({ redisClient: mockRedisClient });
    // Override internal queues with mock
    postPaymentQueueService.adminNotificationQueue = mockQueueInstance;
    postPaymentQueueService.invoicePipelineQueue = mockQueueInstance;
  });

  describe('addAdminNotificationJob', () => {
    it('should enqueue admin notification job with idempotent jobId', async () => {
      const payload = {
        paymentId: 'pay_123',
        clientId: 'cli_456',
        amount: 2500,
        receiptNo: 'RCPT-2026-001',
        planName: 'Pro CCTV Plan',
        sessionId: 'sess_789',
        customerName: 'John Doe',
        businessName: 'Doe Enterprises'
      };

      const job = await postPaymentQueueService.addAdminNotificationJob(payload);

      expect(mockQueueInstance.add).toHaveBeenCalledWith(
        'notify-admin-payment',
        expect.objectContaining({ paymentId: 'pay_123', amount: 2500 }),
        { jobId: 'admin_notif_pay_123' }
      );
      expect(job.id).toBe('job_123');
    });

    it('should return null if paymentId is missing', async () => {
      const job = await postPaymentQueueService.addAdminNotificationJob({});
      expect(job).toBeNull();
    });
  });

  describe('addInvoicePipelineJob', () => {
    it('should enqueue invoice pipeline job with idempotent jobId', async () => {
      const payload = {
        paymentId: 'pay_123',
        clientId: 'cli_456',
        subscriptionId: 'sub_789',
        amount: 2500,
        planName: 'Pro CCTV Plan',
        sessionId: 'sess_789',
        customer: { name: 'John Doe', phone: '+919876543210', email: 'john@example.com' }
      };

      const job = await postPaymentQueueService.addInvoicePipelineJob(payload);

      expect(mockQueueInstance.add).toHaveBeenCalledWith(
        'generate-invoice-pipeline',
        expect.objectContaining({ paymentId: 'pay_123', subscriptionId: 'sub_789' }),
        { jobId: 'invoice_pipeline_pay_123' }
      );
      expect(job.id).toBe('job_123');
    });

    it('should return null if paymentId is missing', async () => {
      const job = await postPaymentQueueService.addInvoicePipelineJob({});
      expect(job).toBeNull();
    });
  });
});
