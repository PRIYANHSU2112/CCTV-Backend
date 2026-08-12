import { jest } from '@jest/globals';
import { DashboardService } from '../../modules/dashboard/dashboard.service.js';

describe('DashboardService (Unit Tests)', () => {
  let dashboardService;
  let mockDashboardRepository;
  let mockRedisService;

  const mockKpis = {
    totalClients: 45,
    activeClients: 38,
    suspendedClients: 2,
    duePayments: 5,
    monthlyRevenue: 125000,
    upcomingRenewals: 4
  };

  const mockCharts = {
    revenueSeries: [{ label: 'Mar 2026', revenue: 105000, collected: 100000, outstanding: 5000 }],
    collectionOutstanding: [{ name: 'Collected', value: 120000 }],
    planDistribution: [{ plan: 'Monthly', value: 20 }],
    methodMix: [{ method: 'UPI', value: 25 }],
    aging: [{ bucket: '0–3 days', value: 3 }],
    renewalPipeline: [{ stage: 'This week', value: 4 }]
  };

  const mockPaginatedPayments = {
    data: [
      { id: '1', receiptNo: 'RCPT-001', clientName: 'Client A', method: 'UPI', status: 'Paid', amount: 1999, paidAt: '2026-08-11T10:00:00Z' }
    ],
    meta: { total: 1, page: 1, limit: 10, totalPages: 1, hasNextPage: false, hasPrevPage: false }
  };

  beforeEach(() => {
    mockDashboardRepository = {
      getKpis: jest.fn().mockResolvedValue(mockKpis),
      getChartAnalytics: jest.fn().mockResolvedValue(mockCharts),
      getPaginatedRecentPayments: jest.fn().mockResolvedValue(mockPaginatedPayments)
    };

    mockRedisService = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(true),
      del: jest.fn().mockResolvedValue(true)
    };

    dashboardService = new DashboardService({
      dashboardRepository: mockDashboardRepository,
      redisService: mockRedisService
    });
  });

  describe('getKpis', () => {
    it('should return cached KPIs from Redis if cache hit', async () => {
      mockRedisService.get.mockResolvedValue(mockKpis);

      const res = await dashboardService.getKpis();

      expect(mockRedisService.get).toHaveBeenCalledWith('dashboard:kpis');
      expect(mockDashboardRepository.getKpis).not.toHaveBeenCalled();
      expect(res).toEqual(mockKpis);
    });

    it('should fetch KPIs from repository and cache in Redis on cache miss', async () => {
      mockRedisService.get.mockResolvedValue(null);

      const res = await dashboardService.getKpis();

      expect(mockDashboardRepository.getKpis).toHaveBeenCalled();
      expect(mockRedisService.set).toHaveBeenCalledWith('dashboard:kpis', mockKpis, 300);
      expect(res).toEqual(mockKpis);
    });
  });

  describe('getChartAnalytics', () => {
    it('should return cached charts from Redis if cache hit', async () => {
      mockRedisService.get.mockResolvedValue(mockCharts);

      const res = await dashboardService.getChartAnalytics(6);

      expect(mockRedisService.get).toHaveBeenCalledWith('dashboard:charts:6');
      expect(mockDashboardRepository.getChartAnalytics).not.toHaveBeenCalled();
      expect(res).toEqual(mockCharts);
    });

    it('should fetch chart analytics from repository on cache miss', async () => {
      mockRedisService.get.mockResolvedValue(null);

      const res = await dashboardService.getChartAnalytics(6);

      expect(mockDashboardRepository.getChartAnalytics).toHaveBeenCalledWith(6);
      expect(mockRedisService.set).toHaveBeenCalledWith('dashboard:charts:6', mockCharts, 300);
      expect(res).toEqual(mockCharts);
    });
  });

  describe('getRecentPayments', () => {
    it('should delegate to dashboardRepository.getPaginatedRecentPayments with query params', async () => {
      const queryParams = { page: 1, limit: 10, search: 'RCPT-001' };

      const res = await dashboardService.getRecentPayments(queryParams);

      expect(mockDashboardRepository.getPaginatedRecentPayments).toHaveBeenCalledWith(queryParams);
      expect(res).toEqual(mockPaginatedPayments);
    });
  });
});
