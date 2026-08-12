import { Router } from 'express';
import { authenticateJwt, requirePermission } from '../../shared/middlewares/auth.middleware.js';
import { Permissions } from '../../shared/constants/permissions.constant.js';

export const createDashboardRouter = (dashboardController) => {
  const router = Router();

  // Protect all dashboard endpoints with JWT authentication & RBAC check
  router.use(authenticateJwt);

  /**
   * @route GET /api/v1/dashboard/stats
   * @desc Get full dashboard overview (KPIs + Charts + Recent Payments)
   * @access Private (dashboard:view)
   */
  router.get(
    '/stats',
    requirePermission(Permissions.DASHBOARD_VIEW),
    dashboardController.getDashboardStats
  );

  /**
   * @route GET /api/v1/dashboard/kpis
   * @desc Get executive KPIs summary
   * @access Private (dashboard:view)
   */
  router.get(
    '/kpis',
    requirePermission(Permissions.DASHBOARD_VIEW),
    dashboardController.getKpis
  );

  /**
   * @route GET /api/v1/dashboard/charts
   * @desc Get all graph and chart analytics data
   * @access Private (dashboard:view)
   */
  router.get(
    '/charts',
    requirePermission(Permissions.DASHBOARD_VIEW),
    dashboardController.getChartAnalytics
  );

  /**
   * @route GET /api/v1/dashboard/recent-payments
   * @desc Get paginated, searchable & filterable recent payments feed
   * @access Private (dashboard:view)
   */
  router.get(
    '/recent-payments',
    requirePermission(Permissions.DASHBOARD_VIEW),
    dashboardController.getRecentPayments
  );

  return router;
};
