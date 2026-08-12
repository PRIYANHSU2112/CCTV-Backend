import { BaseController } from '../../shared/bases/base.controller.js';

export class DashboardController extends BaseController {
  constructor({ dashboardService }) {
    super();
    this.dashboardService = dashboardService;
  }

  /**
   * GET /api/v1/dashboard/stats
   * Fetch full dashboard overview (KPIs + Charts + Recent Payments)
   */
  getDashboardStats = this.catchAsync(async (req, res) => {
    const stats = await this.dashboardService.getDashboardStats();
    return this.sendResponse(res, stats, 'Dashboard statistics retrieved successfully');
  });

  /**
   * GET /api/v1/dashboard/kpis
   * Fetch executive KPIs summary
   */
  getKpis = this.catchAsync(async (req, res) => {
    const kpis = await this.dashboardService.getKpis();
    return this.sendResponse(res, kpis, 'Executive KPIs retrieved successfully');
  });

  /**
   * GET /api/v1/dashboard/charts
   * Fetch graph and chart analytics data
   */
  getChartAnalytics = this.catchAsync(async (req, res) => {
    const { months } = req.query;
    const charts = await this.dashboardService.getChartAnalytics(months);
    return this.sendResponse(res, charts, 'Chart analytics retrieved successfully');
  });

  /**
   * GET /api/v1/dashboard/recent-payments
   * Fetch paginated, searchable & filterable recent payments feed
   */
  getRecentPayments = this.catchAsync(async (req, res) => {
    const { page, limit, search, status, paymentMethod, startDate, endDate } = req.query;
    const result = await this.dashboardService.getRecentPayments({
      page,
      limit,
      search,
      status,
      paymentMethod,
      startDate,
      endDate
    });
    return this.sendPaginated(
      res,
      result.data,
      result.meta.page,
      result.meta.limit,
      result.meta.total,
      'Recent payments feed retrieved successfully'
    );
  });
}
