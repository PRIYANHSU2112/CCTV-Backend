import { jest } from '@jest/globals';
import { SubscriptionService } from '../../modules/subscription/subscription.service.js';
import { ConflictError } from '../../shared/errors/conflict.error.js';
import { NotFoundError } from '../../shared/errors/not-found.error.js';

describe('SubscriptionService (Unit Tests)', () => {
  let subscriptionService;
  let mockSubscriptionRepository;
  let mockRedisService;

  beforeEach(() => {
    mockSubscriptionRepository = {
      findPlanById: jest.fn(),
      findPlanByCode: jest.fn(),
      createPlan: jest.fn(),
      updatePlan: jest.fn(),
      deletePlan: jest.fn(),
      findPaginatedPlansWithAggregation: jest.fn(),
      findSubscriptionById: jest.fn(),
      findActiveSubscriptionByClient: jest.fn(),
      createSubscription: jest.fn(),
      updateSubscription: jest.fn(),
      findPaginatedClientSubscriptionsWithAggregation: jest.fn(),
      getClientSubscriptionSummary: jest.fn()
    };

    mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn()
    };

    subscriptionService = new SubscriptionService({
      subscriptionRepository: mockSubscriptionRepository,
      redisService: mockRedisService
    });
  });

  describe('createPlan', () => {
    it('should successfully create a new subscription plan and cache in Redis', async () => {
      const payload = {
        name: 'Standard 8-Cam',
        planCode: 'STD_8CAM',
        packageTier: 'STANDARD',
        billingCycle: 'MONTHLY',
        durationInMonths: 1,
        basePrice: 5000,
        maxCameras: 8
      };

      mockSubscriptionRepository.findPlanByCode.mockResolvedValue(null);
      mockSubscriptionRepository.createPlan.mockResolvedValue({
        id: 'plan_1',
        ...payload,
        totalPrice: 5900,
        toJSON: () => ({ id: 'plan_1', name: 'Standard 8-Cam', planCode: 'STD_8CAM', packageTier: 'STANDARD', totalPrice: 5900 })
      });
      mockRedisService.set.mockResolvedValue(true);

      const result = await subscriptionService.createPlan(payload);

      expect(mockSubscriptionRepository.findPlanByCode).toHaveBeenCalledWith('STD_8CAM');
      expect(result.id).toBe('plan_1');
      expect(result.totalPrice).toBe(5900);
      expect(mockRedisService.set).toHaveBeenCalled();
    });

    it('should throw ConflictError if plan code already exists', async () => {
      mockSubscriptionRepository.findPlanByCode.mockResolvedValue({ id: 'plan_existing', planCode: 'STD_8CAM' });

      await expect(
        subscriptionService.createPlan({
          name: 'Standard',
          planCode: 'STD_8CAM'
        })
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('getPlanById', () => {
    it('should return plan from Redis cache if available', async () => {
      const cachedPlan = { id: 'plan_1', name: 'Cached Plan', packageTier: 'BASIC' };
      mockRedisService.get.mockResolvedValue(cachedPlan);

      const result = await subscriptionService.getPlanById('plan_1');

      expect(mockRedisService.get).toHaveBeenCalledWith('plan:plan_1');
      expect(mockSubscriptionRepository.findPlanById).not.toHaveBeenCalled();
      expect(result._cached).toBe(true);
    });

    it('should throw NotFoundError if plan does not exist', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockSubscriptionRepository.findPlanById.mockResolvedValue(null);

      await expect(subscriptionService.getPlanById('non_existing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getClientSubscriptionSummary', () => {
    it('should return aggregated summary and cache it', async () => {
      const summary = {
        active: 2,
        expired: 1,
        suspended: 0,
        autoRenewOn: 2,
        byPlan: [{ plan: 'Monthly', count: 2 }],
      };
      mockRedisService.get.mockResolvedValue(null);
      mockSubscriptionRepository.getClientSubscriptionSummary.mockResolvedValue(summary);
      mockRedisService.set.mockResolvedValue(true);

      const result = await subscriptionService.getClientSubscriptionSummary();

      expect(result.active).toBe(2);
      expect(mockSubscriptionRepository.getClientSubscriptionSummary).toHaveBeenCalled();
      expect(mockRedisService.set).toHaveBeenCalledWith('sub:summary', summary, expect.anything());
    });
  });

  describe('setSubscriptionAutoRenewal', () => {
    it('should update autoRenewal flag', async () => {
      mockSubscriptionRepository.findSubscriptionById.mockResolvedValue({
        id: 'sub_1',
        clientId: 'user_1',
        autoRenewal: false,
      });
      mockSubscriptionRepository.updateSubscription.mockResolvedValue({
        id: 'sub_1',
        autoRenewal: true,
        toJSON: () => ({ id: 'sub_1', autoRenewal: true }),
      });

      const result = await subscriptionService.setSubscriptionAutoRenewal('sub_1', true);

      expect(mockSubscriptionRepository.updateSubscription).toHaveBeenCalledWith('sub_1', {
        autoRenewal: true,
      });
      expect(result.autoRenewal).toBe(true);
    });

    it('should throw NotFoundError when subscription missing', async () => {
      mockSubscriptionRepository.findSubscriptionById.mockResolvedValue(null);
      await expect(
        subscriptionService.setSubscriptionAutoRenewal('missing', false),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
