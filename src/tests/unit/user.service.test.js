import { jest } from '@jest/globals';
import { UserService } from '../../modules/user/user.service.js';
import { ConflictError } from '../../shared/errors/conflict.error.js';
import { NotFoundError } from '../../shared/errors/not-found.error.js';

describe('UserService (Unit Tests)', () => {
  let userService;
  let mockUserRepository;
  let mockHashService;
  let mockRedisService;

  beforeEach(() => {
    mockUserRepository = {
      findByPhone: jest.fn(),
      findByEmail: jest.fn(),
      findByUsernameOrEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      updateLastLogin: jest.fn(),
      findPaginatedWithAggregation: jest.fn()
    };

    mockHashService = {
      hashPassword: jest.fn(),
      comparePassword: jest.fn()
    };

    mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn()
    };

    userService = new UserService({
      userRepository: mockUserRepository,
      hashService: mockHashService,
      redisService: mockRedisService
    });
  });

  describe('registerUser', () => {
    it('should successfully register a new user and cache in Redis', async () => {
      const payload = {
        name: 'Jane Doe',
        phone: '+919876543210',
        email: 'jane@example.com',
        password: 'password123',
        role: 'CLIENT'
      };

      mockUserRepository.findByPhone.mockResolvedValue(null);
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockHashService.hashPassword.mockResolvedValue('hashed_pwd_123');
      mockUserRepository.create.mockResolvedValue({
        id: 'usr_1',
        ...payload,
        password: 'hashed_pwd_123',
        toJSON: () => ({ id: 'usr_1', name: 'Jane Doe', phone: '+919876543210', email: 'jane@example.com', role: 'CLIENT' })
      });
      mockRedisService.set.mockResolvedValue(true);

      const result = await userService.registerUser(payload);

      expect(mockUserRepository.findByPhone).toHaveBeenCalledWith('+919876543210');
      expect(mockHashService.hashPassword).toHaveBeenCalledWith('password123');
      expect(result.id).toBe('usr_1');
      expect(result.phone).toBe('+919876543210');
      expect(mockRedisService.set).toHaveBeenCalled();
    });

    it('should throw ConflictError if phone number is already taken', async () => {
      mockUserRepository.findByPhone.mockResolvedValue({ id: 'usr_existing', phone: '+919876543210' });

      await expect(
        userService.registerUser({
          name: 'Jane',
          phone: '+919876543210',
          password: 'pwd'
        })
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('sendOtp', () => {
    it('should generate secure OTP and store in Redis', async () => {
      mockRedisService.set.mockResolvedValue(true);

      const result = await userService.sendOtp({ phone: '+919876543210' });

      expect(result.success).toBe(true);
      expect(result.phone).toBe('9876543210');
      expect(mockRedisService.set).toHaveBeenCalled();
    });
  });

  describe('loginByOtp', () => {
    it('should successfully log in existing user when valid OTP is verified against Redis', async () => {
      const mockUser = {
        _id: 'usr_1',
        id: 'usr_1',
        phone: '9876543210',
        status: 'ACTIVE',
        toJSON: () => ({ id: 'usr_1', phone: '9876543210', status: 'ACTIVE' })
      };
      mockRedisService.get.mockResolvedValue('543210');
      mockRedisService.del.mockResolvedValue(1);
      mockUserRepository.findByPhone.mockResolvedValue(mockUser);
      mockUserRepository.updateLastLogin.mockResolvedValue(true);

      const result = await userService.loginByOtp({ phone: '+919876543210', otp: '543210' });

      expect(result.user.id).toBe('usr_1');
      expect(result.tokens).toHaveProperty('accessToken');
      expect(mockUserRepository.updateLastLogin).toHaveBeenCalledWith('usr_1');
    });

    it('should auto-create user if user does not exist with valid OTP', async () => {
      mockRedisService.get.mockResolvedValue('543210');
      mockRedisService.del.mockResolvedValue(1);
      mockUserRepository.findByPhone.mockResolvedValue(null);
      const createdUser = {
        _id: 'usr_new',
        id: 'usr_new',
        phone: '9876543210',
        name: 'User 3210',
        status: 'ACTIVE',
        toJSON: () => ({ id: 'usr_new', phone: '9876543210', name: 'User 3210', status: 'ACTIVE' })
      };
      mockUserRepository.create.mockResolvedValue(createdUser);
      mockUserRepository.updateLastLogin.mockResolvedValue(true);

      const result = await userService.loginByOtp({ phone: '+919876543210', otp: '543210' });

      expect(mockUserRepository.create).toHaveBeenCalledWith({
        name: 'User 3210',
        phone: '9876543210',
        role: 'CLIENT',
        status: 'ACTIVE'
      });
      expect(result.user.id).toBe('usr_new');
      expect(result.tokens).toHaveProperty('accessToken');
    });

    it('should throw UnauthorizedError when invalid OTP is provided', async () => {
      mockRedisService.get.mockResolvedValue(null);

      await expect(
        userService.loginByOtp({ phone: '+919876543210', otp: '9999' })
      ).rejects.toThrow('Invalid or expired OTP');
    });
  });

  describe('getUserById', () => {
    it('should return user from Redis cache if available', async () => {
      const cachedUser = { id: 'usr_1', name: 'Cached User', email: 'cached@example.com' };
      mockRedisService.get.mockResolvedValue(cachedUser);

      const result = await userService.getUserById('usr_1');

      expect(mockRedisService.get).toHaveBeenCalledWith('user:usr_1');
      expect(mockUserRepository.findById).not.toHaveBeenCalled();
      expect(result._cached).toBe(true);
    });

    it('should fetch from repository and cache in Redis if cache miss', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockUserRepository.findById.mockResolvedValue({
        id: 'usr_2',
        name: 'DB User',
        email: 'db@example.com',
        toJSON: () => ({ id: 'usr_2', name: 'DB User', email: 'db@example.com' })
      });

      const result = await userService.getUserById('usr_2');

      expect(mockUserRepository.findById).toHaveBeenCalledWith('usr_2');
      expect(result.id).toBe('usr_2');
      expect(mockRedisService.set).toHaveBeenCalled();
    });

    it('should throw NotFoundError if user does not exist in DB', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(userService.getUserById('non_existing')).rejects.toThrow(NotFoundError);
    });
  });
});
