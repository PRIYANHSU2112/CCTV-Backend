import { jest } from '@jest/globals';
import { ClientService } from '../../modules/client/client.service.js';
import { ConflictError } from '../../shared/errors/conflict.error.js';
import { NotFoundError } from '../../shared/errors/not-found.error.js';
import { CompanyModel } from '../../modules/company/company.model.js';

describe('ClientService (Unit Tests)', () => {
  let clientService;
  let mockClientRepository;
  let mockUserRepository;
  let mockHashService;
  let mockSubscriptionRepository;
  let mockRedisService;

  beforeEach(() => {
    jest.spyOn(CompanyModel, 'findOne').mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          installationCharge: 6000,
          installationHsnSac: '995469',
          installationGstEnabled: true,
          installationGstRate: 18,
        })
      })
    });
    mockClientRepository = {
      findById: jest.fn(),
      findByUserId: jest.fn(),
      findByBusinessName: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      addCamera: jest.fn(),
      delete: jest.fn(),
      findPaginatedClientsWithAggregation: jest.fn()
    };

    mockUserRepository = {
      findByPhone: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    };

    mockHashService = {
      hashPassword: jest.fn()
    };

    mockSubscriptionRepository = {
      findPlanById: jest.fn(),
      findPlanByTierAndCycle: jest.fn(),
      findActivePlanByTier: jest.fn(),
      createPlan: jest.fn(),
      createSubscription: jest.fn(),
    };

    mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn()
    };

    clientService = new ClientService({
      clientRepository: mockClientRepository,
      userRepository: mockUserRepository,
      hashService: mockHashService,
      subscriptionRepository: mockSubscriptionRepository,
      redisService: mockRedisService
    });
  });

  describe('registerClient', () => {
    it('should register client and create subscription from form package/plan', async () => {
      const payload = {
        name: 'Satya Prakash',
        phone: '9876543210',
        email: 'satya@example.com',
        businessName: 'Sharma Electronics',
        address: '123 MP Nagar',
        city: 'Bhopal',
        pincode: '462011',
        packageId: 'standard',
        plan: 'Monthly',
        monthlyCharge: 2799,
        cameras: 8,
        packageName: 'Standard',
        autoRenew: true,
      };

      mockUserRepository.findByPhone.mockResolvedValue(null);
      mockHashService.hashPassword.mockResolvedValue('hashed_pwd_123');
      mockUserRepository.create.mockResolvedValue({
        _id: 'usr_1',
        name: 'Satya Prakash',
        phone: '9876543210',
        email: 'satya@example.com',
        role: 'CLIENT'
      });
      mockClientRepository.create.mockResolvedValue({
        id: 'cli_1',
        _id: 'cli_1',
        businessName: 'Sharma Electronics',
        installationAddress: { address: '123 MP Nagar', city: 'Bhopal', pincode: '462011' },
        toJSON: () => ({ id: 'cli_1', businessName: 'Sharma Electronics' })
      });
      mockClientRepository.update.mockResolvedValue({
        id: 'cli_1',
        currentSubscriptionId: 'sub_1',
        toJSON: () => ({ id: 'cli_1', currentSubscriptionId: 'sub_1' }),
      });
      mockClientRepository.findById.mockResolvedValue({
        id: 'cli_1',
        businessName: 'Sharma Electronics',
        totalCamerasInstalled: 8,
        currentSubscriptionId: 'sub_1',
        toJSON: () => ({
          id: 'cli_1',
          businessName: 'Sharma Electronics',
          totalCamerasInstalled: 8,
          currentSubscriptionId: 'sub_1',
        }),
      });
      mockSubscriptionRepository.findPlanByTierAndCycle.mockResolvedValue({
        _id: 'plan_1',
        packageTier: 'STANDARD',
        billingCycle: 'MONTHLY',
      });
      mockSubscriptionRepository.createSubscription.mockResolvedValue({
        _id: 'sub_1',
        id: 'sub_1',
        monthlyCharge: 2799,
        toJSON: () => ({ id: 'sub_1', monthlyCharge: 2799, status: 'ACTIVE' }),
      });
      mockRedisService.set.mockResolvedValue(true);
      mockRedisService.del.mockResolvedValue(true);

      const result = await clientService.registerClient(payload);

      expect(mockUserRepository.findByPhone).toHaveBeenCalledWith('9876543210');
      expect(mockClientRepository.create).toHaveBeenCalled();
      expect(mockSubscriptionRepository.createSubscription).toHaveBeenCalled();
      expect(mockClientRepository.update).toHaveBeenCalledWith(
        'cli_1',
        expect.objectContaining({ currentSubscriptionId: 'sub_1' }),
      );
      expect(result.id).toBe('cli_1');
      expect(result.user.id).toBe('usr_1');
      expect(result.subscription.id).toBe('sub_1');
    });

    it('should use provided planId and store it on the subscription', async () => {
      mockUserRepository.findByPhone.mockResolvedValue(null);
      mockHashService.hashPassword.mockResolvedValue('hashed');
      mockUserRepository.create.mockResolvedValue({
        _id: 'usr_3',
        name: 'Plan User',
        phone: '9000000003',
        role: 'CLIENT',
      });
      mockClientRepository.create.mockResolvedValue({
        id: 'cli_3',
        _id: 'cli_3',
        toJSON: () => ({ id: 'cli_3' }),
      });
      mockClientRepository.update.mockResolvedValue({ id: 'cli_3' });
      mockClientRepository.findById.mockResolvedValue({
        id: 'cli_3',
        toJSON: () => ({ id: 'cli_3', totalCamerasInstalled: 16 }),
      });
      mockSubscriptionRepository.findPlanById.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        packageTier: 'PREMIUM',
        billingCycle: 'YEARLY',
        basePrice: 4999,
        maxCameras: 16,
        durationInMonths: 12,
      });
      mockSubscriptionRepository.createSubscription.mockResolvedValue({
        id: 'sub_3',
        toJSON: () => ({ id: 'sub_3' }),
      });

      const result = await clientService.registerClient({
        name: 'Plan User',
        phone: '9000000003',
        businessName: 'Premium Shop',
        address: 'Street 9',
        city: 'Indore',
        pincode: '452001',
        planId: '507f1f77bcf86cd799439011',
        monthlyCharge: 4999,
      });

      expect(mockSubscriptionRepository.findPlanById).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
      );
      expect(mockSubscriptionRepository.createPlan).not.toHaveBeenCalled();
      expect(mockSubscriptionRepository.createSubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          planId: '507f1f77bcf86cd799439011',
          packageTier: 'PREMIUM',
          cameraCount: 16,
          monthlyCharge: 4999,
        }),
      );
      expect(result.subscription.id).toBe('sub_3');
      expect(result.plan).toBe('YEARLY');
    });

    it('should auto-create plan when none exists then create subscription', async () => {
      mockUserRepository.findByPhone.mockResolvedValue(null);
      mockHashService.hashPassword.mockResolvedValue('hashed');
      mockUserRepository.create.mockResolvedValue({
        _id: 'usr_2',
        name: 'New',
        phone: '9999999999',
        role: 'CLIENT',
      });
      mockClientRepository.create.mockResolvedValue({
        id: 'cli_2',
        _id: 'cli_2',
        toJSON: () => ({ id: 'cli_2' }),
      });
      mockClientRepository.update.mockResolvedValue({ id: 'cli_2' });
      mockClientRepository.findById.mockResolvedValue({
        id: 'cli_2',
        toJSON: () => ({ id: 'cli_2', totalCamerasInstalled: 4 }),
      });
      mockSubscriptionRepository.findPlanByTierAndCycle.mockResolvedValue(null);
      mockSubscriptionRepository.findActivePlanByTier.mockResolvedValue(null);
      mockSubscriptionRepository.createPlan.mockResolvedValue({
        _id: 'plan_auto',
        packageTier: 'BASIC',
        billingCycle: 'MONTHLY',
      });
      mockSubscriptionRepository.createSubscription.mockResolvedValue({
        id: 'sub_2',
        toJSON: () => ({ id: 'sub_2' }),
      });

      const result = await clientService.registerClient({
        name: 'New Client',
        phone: '9999999999',
        businessName: 'Shop',
        address: 'Street 1',
        city: 'Pune',
        pincode: '411001',
        packageTier: 'BASIC',
        billingCycle: 'MONTHLY',
        monthlyCharge: 1499,
        cameras: 4,
      });

      expect(mockSubscriptionRepository.createPlan).toHaveBeenCalled();
      expect(mockSubscriptionRepository.createSubscription).toHaveBeenCalled();
      expect(result.subscription.id).toBe('sub_2');
    });

    it('should throw ConflictError if client already exists for existing phone number', async () => {
      mockUserRepository.findByPhone.mockResolvedValue({ _id: 'usr_existing', phone: '9876543210' });
      mockClientRepository.findByUserId.mockResolvedValue({ id: 'cli_existing' });

      await expect(
        clientService.registerClient({
          name: 'Satya',
          phone: '9876543210',
          businessName: 'Existing Store',
          address: 'Address',
          city: 'City',
          pincode: '123456'
        })
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('getClientById', () => {
    it('should return client from Redis cache if available', async () => {
      const cachedClient = { id: 'cli_1', businessName: 'Cached Store' };
      mockRedisService.get.mockResolvedValue(cachedClient);

      const result = await clientService.getClientById('cli_1');

      expect(mockRedisService.get).toHaveBeenCalledWith('client:cli_1');
      expect(mockClientRepository.findById).not.toHaveBeenCalled();
      expect(result._cached).toBe(true);
    });

    it('should fetch from repository and cache in Redis if cache miss', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockClientRepository.findById.mockResolvedValue({
        id: 'cli_2',
        businessName: 'DB Store',
        toJSON: () => ({ id: 'cli_2', businessName: 'DB Store' })
      });

      const result = await clientService.getClientById('cli_2');

      expect(mockClientRepository.findById).toHaveBeenCalledWith('cli_2');
      expect(result.id).toBe('cli_2');
      expect(mockRedisService.set).toHaveBeenCalled();
    });

    it('should throw NotFoundError if client does not exist in DB', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockClientRepository.findById.mockResolvedValue(null);

      await expect(clientService.getClientById('non_existing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateClientStatus', () => {
    it('should normalize status to Active and update client status', async () => {
      mockClientRepository.updateStatus.mockResolvedValue({
        id: 'cli_3',
        _id: 'cli_3',
        businessName: 'Approach Shop',
        status: 'Active',
        userId: { _id: 'u_3', name: 'Rohan', phone: '9876543210', email: 'rohan@test.com' },
        toJSON: () => ({ id: 'cli_3', businessName: 'Approach Shop', status: 'Active' })
      });
      mockClientRepository.model = {
        updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 })
      };

      const result = await clientService.updateClientStatus('cli_3', 'ACTIVE');

      expect(mockClientRepository.updateStatus).toHaveBeenCalledWith('cli_3', 'Active');
      expect(result.status).toBe('Active');
      expect(mockRedisService.del).toHaveBeenCalledWith('client:cli_3');
      expect(mockRedisService.del).toHaveBeenCalledWith('client:stats');
      expect(mockRedisService.del).toHaveBeenCalledWith('dashboard:kpis');
    });
  });
});
