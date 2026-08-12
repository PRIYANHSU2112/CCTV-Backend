import { jest } from '@jest/globals';
import { PaymentService } from '../../modules/payment/payment.service.js';
import { NotFoundError } from '../../shared/errors/not-found.error.js';

describe('PaymentService (Unit Tests)', () => {
  let paymentService;
  let mockPaymentRepository;
  let mockClientRepository;
  let mockSubscriptionRepository;
  let mockRedisService;

  beforeEach(() => {
    mockPaymentRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByReceiptNo: jest.fn(),
      findPaginatedPaymentsWithAggregation: jest.fn(),
      getPaymentSummary: jest.fn(),
    };

    mockClientRepository = {
      findById: jest.fn(),
      updateStatus: jest.fn(),
    };

    mockSubscriptionRepository = {
      updateSubscription: jest.fn(),
    };

    mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    paymentService = new PaymentService({
      paymentRepository: mockPaymentRepository,
      clientRepository: mockClientRepository,
      subscriptionRepository: mockSubscriptionRepository,
      redisService: mockRedisService,
    });
  });

  describe('recordPayment', () => {
    it('should record payment with auto receipt and update subscription lastPaymentDate', async () => {
      mockClientRepository.findById.mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        businessName: 'Sharma Electronics',
        status: 'Due',
        currentSubscriptionId: '507f1f77bcf86cd799439022',
        userId: { name: 'Satya' },
        toJSON: () => ({
          id: '507f1f77bcf86cd799439011',
          businessName: 'Sharma Electronics',
          status: 'Due',
          userId: { name: 'Satya' },
        }),
      });
      mockPaymentRepository.findByReceiptNo.mockResolvedValue(null);
      mockPaymentRepository.create.mockResolvedValue({
        _id: '507f1f77bcf86cd799439033',
        receiptNo: 'RCPT-20260808-1234',
        amount: 2799,
        method: 'UPI',
        status: 'PAID',
        toJSON: () => ({
          id: '507f1f77bcf86cd799439033',
          receiptNo: 'RCPT-20260808-1234',
          amount: 2799,
          method: 'UPI',
          status: 'PAID',
        }),
      });
      mockSubscriptionRepository.updateSubscription.mockResolvedValue({});
      mockClientRepository.updateStatus.mockResolvedValue({});
      mockRedisService.del.mockResolvedValue(true);

      const result = await paymentService.recordPayment({
        clientId: '507f1f77bcf86cd799439011',
        amount: 2799,
        method: 'UPI',
        note: 'Monthly fee',
      });

      expect(mockPaymentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: '507f1f77bcf86cd799439011',
          subscriptionId: '507f1f77bcf86cd799439022',
          amount: 2799,
          method: 'UPI',
          status: 'PAID',
          note: 'Monthly fee',
          receiptNo: expect.stringMatching(/^RCPT-\d{8}-\d{4}$/),
        }),
      );
      expect(mockSubscriptionRepository.updateSubscription).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439022',
        expect.objectContaining({ lastPaymentDate: expect.any(Date) }),
      );
      expect(mockClientRepository.updateStatus).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        'Active',
      );
      expect(result.payment.receiptNo).toBe('RCPT-20260808-1234');
      expect(result.client.businessName).toBe('Sharma Electronics');
    });

    it('should throw NotFoundError when client does not exist', async () => {
      mockClientRepository.findById.mockResolvedValue(null);

      await expect(
        paymentService.recordPayment({
          clientId: '507f1f77bcf86cd799439099',
          amount: 100,
          method: 'CASH',
        }),
      ).rejects.toThrow(NotFoundError);

      expect(mockPaymentRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('listPayments', () => {
    it('should return paginated payment history', async () => {
      mockPaymentRepository.findPaginatedPaymentsWithAggregation.mockResolvedValue({
        items: [
          {
            id: 'pay_1',
            receiptNo: 'RCPT-20260808-1111',
            amount: 1499,
            method: 'UPI',
            status: 'PAID',
          },
        ],
        total: 1,
      });

      const result = await paymentService.listPayments({
        page: 1,
        limit: 10,
        method: 'UPI',
        status: 'all',
      });

      expect(mockPaymentRepository.findPaginatedPaymentsWithAggregation).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          limit: 10,
          method: 'UPI',
          status: null,
        }),
      );
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });
  });

  describe('getPaymentById', () => {
    it('should throw NotFoundError if payment missing', async () => {
      mockPaymentRepository.findById.mockResolvedValue(null);

      await expect(paymentService.getPaymentById('507f1f77bcf86cd799439044')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('should return enriched payment', async () => {
      mockPaymentRepository.findById.mockResolvedValue({
        _id: '507f1f77bcf86cd799439033',
        clientId: '507f1f77bcf86cd799439011',
        receiptNo: 'RCPT-1',
        amount: 500,
        toJSON: () => ({
          id: '507f1f77bcf86cd799439033',
          clientId: '507f1f77bcf86cd799439011',
          receiptNo: 'RCPT-1',
          amount: 500,
        }),
      });
      mockClientRepository.findById.mockResolvedValue({
        toJSON: () => ({
          businessName: 'Shop',
          userId: { name: 'Owner' },
        }),
      });

      const result = await paymentService.getPaymentById('507f1f77bcf86cd799439033');
      expect(result.receiptNo).toBe('RCPT-1');
      expect(result.businessName).toBe('Shop');
      expect(result.clientName).toBe('Owner');
    });
  });

  describe('listClientPayments', () => {
    it('should throw NotFoundError when client missing', async () => {
      mockClientRepository.findById.mockResolvedValue(null);

      await expect(
        paymentService.listClientPayments('507f1f77bcf86cd799439099'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getPaymentSummary', () => {
    it('should return summary from repository and cache it', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockPaymentRepository.getPaymentSummary.mockResolvedValue({
        totalAmount: 5000,
        count: 2,
        byStatus: { PAID: { count: 2, amount: 5000 } },
        byMethod: { UPI: { count: 2, amount: 5000 } },
      });
      mockRedisService.set.mockResolvedValue(true);

      const result = await paymentService.getPaymentSummary();
      expect(result.totalAmount).toBe(5000);
      expect(mockRedisService.set).toHaveBeenCalled();
    });
  });
});
