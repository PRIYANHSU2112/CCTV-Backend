import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SearchService } from '../../modules/search/search.service.js';

describe('SearchService (Unit Tests)', () => {
  let searchService;
  let mockSearchRepository;
  let mockRedisService;

  beforeEach(() => {
    mockSearchRepository = {
      searchClients: jest.fn(),
      searchInvoices: jest.fn(),
      searchPayments: jest.fn(),
      searchSubscriptions: jest.fn(),
      searchUsers: jest.fn(),
    };

    mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
    };

    searchService = new SearchService({
      searchRepository: mockSearchRepository,
      redisService: mockRedisService,
    });
  });

  describe('globalSearch', () => {
    it('should return empty results for empty query string', async () => {
      const res = await searchService.globalSearch({ query: '   ' });
      expect(res.results.clients).toEqual([]);
      expect(res.meta.totalMatches).toBe(0);
    });

    it('should return cached results if available in Redis', async () => {
      const cachedData = {
        results: {
          nav: [],
          clients: [{ id: '1', title: 'Sharma Store' }],
          invoices: [],
          payments: [],
          subscriptions: [],
          plans: [],
          users: [],
        },
        meta: { totalMatches: 1, query: 'sharma', cached: false },
      };
      mockRedisService.get.mockResolvedValue(cachedData);

      const res = await searchService.globalSearch({ query: 'sharma' });
      expect(mockRedisService.get).toHaveBeenCalledWith('search:all:sharma:5');
      expect(res.meta.cached).toBe(true);
      expect(res.results.clients).toHaveLength(1);
    });

    it('should execute multi-entity search concurrently and format responses correctly', async () => {
      mockRedisService.get.mockResolvedValue(null);

      mockSearchRepository.searchClients.mockResolvedValue([
        {
          _id: '507f1f77bcf86cd799439011',
          businessName: 'Sharma Electronics',
          email: 'sharma@example.com',
          status: 'Active',
          userId: { name: 'Ramesh Sharma', phone: '9876543210' },
          installationAddress: { city: 'Bhopal' },
        },
      ]);

      mockSearchRepository.searchInvoices.mockResolvedValue([
        {
          _id: '507f1f77bcf86cd799439022',
          invoiceNumber: 'INV-2026-00001',
          totalAmount: 7080,
          status: 'PAID',
          clientId: { businessName: 'Sharma Electronics' },
        },
      ]);

      mockSearchRepository.searchPayments.mockResolvedValue([
        {
          _id: '507f1f77bcf86cd799439033',
          receiptNo: 'RCPT-20260822-001',
          amount: 7080,
          method: 'CASH',
          status: 'PAID',
          clientId: { businessName: 'Sharma Electronics' },
        },
      ]);

      mockSearchRepository.searchSubscriptions.mockResolvedValue({
        subscriptions: [
          {
            _id: '507f1f77bcf86cd799439044',
            packageTier: 'BASIC',
            totalPlanPrice: 7080,
            status: 'ACTIVE',
            clientId: { businessName: 'Sharma Electronics' },
          },
        ],
        plans: [],
      });

      mockSearchRepository.searchUsers.mockResolvedValue([
        {
          _id: '507f1f77bcf86cd799439055',
          name: 'Ramesh Sharma',
          email: 'ramesh@example.com',
          role: 'CLIENT',
        },
      ]);

      const res = await searchService.globalSearch({ query: 'Sharma' });

      expect(mockSearchRepository.searchClients).toHaveBeenCalledWith('Sharma', 5);
      expect(mockSearchRepository.searchInvoices).toHaveBeenCalledWith('Sharma', 5);
      expect(mockSearchRepository.searchPayments).toHaveBeenCalledWith('Sharma', 5);
      expect(mockSearchRepository.searchSubscriptions).toHaveBeenCalledWith('Sharma', 5);
      expect(mockSearchRepository.searchUsers).toHaveBeenCalledWith('Sharma', 5);

      expect(res.results.clients[0].title).toBe('Sharma Electronics');
      expect(res.results.clients[0].url).toBe('/clients/507f1f77bcf86cd799439011');
      expect(res.results.invoices[0].title).toBe('INV-2026-00001');
      expect(res.results.payments[0].title).toBe('RCPT-20260822-001');
      expect(res.results.subscriptions[0].title).toBe('BASIC Plan');
      expect(res.results.users[0].title).toBe('Ramesh Sharma');

      expect(res.meta.totalMatches).toBeGreaterThanOrEqual(5);
      expect(mockRedisService.set).toHaveBeenCalledWith(
        'search:all:sharma:5',
        expect.any(Object),
        30
      );
    });
  });
});
