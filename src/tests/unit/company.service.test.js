import { jest } from '@jest/globals';
import { CompanyService } from '../../modules/company/company.service.js';

describe('CompanyService (Unit Tests)', () => {
  let companyService;
  let mockCompanyRepository;
  let mockRedisService;

  const mockCompanyDoc = {
    _id: 'comp_123',
    id: 'comp_123',
    legalName: 'Satya Kabir CCTV Private Limited',
    displayName: 'Satya Kabir CCTV Solutions',
    email: 'info@satyakabir.in',
    phone: '+919876543210',
    website: 'https://satyakabir.in',
    socialMedia: {
      facebook: 'https://facebook.com/satyakabir',
      instagram: 'https://instagram.com/satyakabir'
    },
    policies: {
      termsAndConditions: 'Terms content',
      privacyPolicy: 'Privacy content'
    },
    toJSON: () => ({
      id: 'comp_123',
      legalName: 'Satya Kabir CCTV Private Limited',
      displayName: 'Satya Kabir CCTV Solutions',
      email: 'info@satyakabir.in',
      phone: '+919876543210',
      website: 'https://satyakabir.in',
      socialMedia: {
        facebook: 'https://facebook.com/satyakabir',
        instagram: 'https://instagram.com/satyakabir'
      },
      policies: {
        termsAndConditions: 'Terms content',
        privacyPolicy: 'Privacy content'
      }
    })
  };

  beforeEach(() => {
    mockCompanyRepository = {
      getCompanyProfile: jest.fn(),
      updateCompanyProfile: jest.fn()
    };

    mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn()
    };

    companyService = new CompanyService({
      companyRepository: mockCompanyRepository,
      redisService: mockRedisService
    });
  });

  describe('getCompany', () => {
    it('should return cached company profile from Redis if available', async () => {
      const cachedData = { id: 'comp_123', displayName: 'Cached Satya Kabir' };
      mockRedisService.get.mockResolvedValue(cachedData);

      const result = await companyService.getCompany();

      expect(mockRedisService.get).toHaveBeenCalledWith('company:profile');
      expect(mockCompanyRepository.getCompanyProfile).not.toHaveBeenCalled();
      expect(result._cached).toBe(true);
      expect(result.displayName).toBe('Cached Satya Kabir');
    });

    it('should fetch from repository and cache in Redis on cache miss', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockCompanyRepository.getCompanyProfile.mockResolvedValue(mockCompanyDoc);

      const result = await companyService.getCompany();

      expect(mockCompanyRepository.getCompanyProfile).toHaveBeenCalled();
      expect(mockRedisService.set).toHaveBeenCalledWith('company:profile', expect.any(Object), 3600);
      expect(result.id).toBe('comp_123');
      expect(result.socialMedia.facebook).toBe('https://facebook.com/satyakabir');
    });
  });

  describe('updateCompany', () => {
    it('should update company profile and invalidate Redis cache', async () => {
      mockCompanyRepository.getCompanyProfile.mockResolvedValue(mockCompanyDoc);
      
      const updateData = {
        displayName: 'Satya Kabir NextGen CCTV',
        socialMedia: { twitter: 'https://twitter.com/satyakabir' }
      };

      const updatedDoc = {
        ...mockCompanyDoc,
        displayName: 'Satya Kabir NextGen CCTV',
        toJSON: () => ({
          ...mockCompanyDoc.toJSON(),
          displayName: 'Satya Kabir NextGen CCTV'
        })
      };

      mockCompanyRepository.updateCompanyProfile.mockResolvedValue(updatedDoc);
      mockRedisService.del.mockResolvedValue(true);

      const result = await companyService.updateCompany(updateData);

      expect(mockCompanyRepository.updateCompanyProfile).toHaveBeenCalledWith('comp_123', updateData);
      expect(mockRedisService.del).toHaveBeenCalledWith('company:profile');
      expect(result.displayName).toBe('Satya Kabir NextGen CCTV');
    });
  });
});
