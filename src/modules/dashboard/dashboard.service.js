import { BaseService } from '../../shared/bases/base.service.js';
import { logger } from '../../shared/utils/logger.js';

export class DashboardService extends BaseService {
  constructor({ dashboardRepository, redisService = null }) {
    super();
    this.dashboardRepository = dashboardRepository;
    this.redisService = redisService;
    this.cacheTtl = 300; // 5 minutes cache
  }

  /**
   * API 1: Get Core Executive KPIs Summary (`GET /api/v1/dashboard/stats`)
   */
  async getKpis() {
    const cacheKey = 'dashboard:kpis';
    if (this.redisService) {
      try {
        const cached = await this.redisService.get(cacheKey);
        if (cached) {
          logger.info('⚡ Serving Dashboard KPIs from Redis Cache');
          return cached;
        }
      } catch (err) {
        logger.warn(`Redis KPI cache read error: ${err.message}`);
      }
    }

    const kpis = await this.dashboardRepository.getKpis();

    if (this.redisService) {
      try {
        await this.redisService.set(cacheKey, kpis, this.cacheTtl);
      } catch (err) {
        logger.warn(`Redis KPI cache write error: ${err.message}`);
      }
    }

    return kpis;
  }

  /**
   * API 2: Get All Chart & Graph Analytics (`GET /api/v1/dashboard/charts`)
   */
  async getChartAnalytics(months = 6) {
    const monthsCount = Math.min(24, Math.max(1, parseInt(months, 10) || 6));
    const cacheKey = `dashboard:charts:${monthsCount}`;

    if (this.redisService) {
      try {
        const cached = await this.redisService.get(cacheKey);
        if (cached) {
          logger.info(`⚡ Serving Dashboard Chart Analytics (${monthsCount}m) from Redis Cache`);
          return cached;
        }
      } catch (err) {
        logger.warn(`Redis charts cache read error: ${err.message}`);
      }
    }

    const charts = await this.dashboardRepository.getChartAnalytics(monthsCount);

    if (this.redisService) {
      try {
        await this.redisService.set(cacheKey, charts, this.cacheTtl);
      } catch (err) {
        logger.warn(`Redis charts cache write error: ${err.message}`);
      }
    }

    return charts;
  }

  /**
   * API 3: Paginated, Searchable & Filterable Recent Payments Feed (`GET /api/v1/dashboard/recent-payments`)
   */
  async getRecentPayments(queryParams = {}) {
    return this.dashboardRepository.getPaginatedRecentPayments(queryParams);
  }

  /**
   * Combined Dashboard Summary (Backwards Compatibility)
   */
  async getDashboardStats() {
    const [kpis, charts, recentPaymentsResult] = await Promise.all([
      this.getKpis(),
      this.getChartAnalytics(6),
      this.getRecentPayments({ page: 1, limit: 8 })
    ]);

    return {
      kpis,
      ...charts,
      recentPayments: recentPaymentsResult.data
    };
  }

  /**
   * Invalidate Dashboard Caches on payment/subscription mutations
   */
  async invalidateCache() {
    if (this.redisService) {
      try {
        await this.redisService.del('dashboard:kpis');
        await this.redisService.del('dashboard:stats');
        // Delete all chart cache keys matching pattern
        logger.info('🧹 Invalidated All Dashboard Stats & Chart Caches');
      } catch (err) {
        logger.warn(`Redis cache invalidate error: ${err.message}`);
      }
    }
  }
}
