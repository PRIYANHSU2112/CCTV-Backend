import { Router } from 'express';
import { validateRequest } from '../../shared/middlewares/validate.middleware.js';
import {
  createPlanSchema,
  updatePlanSchema,
  assignSubscriptionSchema,
  renewSubscriptionSchema,
  updateSubscriptionStatusSchema,
  updateAutoRenewSchema,
  queryPlansSchema,
  queryClientSubscriptionsSchema
} from './subscription.validator.js';

export const createSubscriptionRouter = (subscriptionController) => {
  const router = Router();

  // --- Plan Routes ---

  /**
   * @route POST /api/v1/subscriptions/plans
   * @desc Create a new Subscription Plan (BASIC, STANDARD, PREMIUM, ENTERPRISE)
   */
  router.post('/plans', validateRequest(createPlanSchema), subscriptionController.createPlan);

  /**
   * @route GET /api/v1/subscriptions/plans
   * @desc Get paginated list of plans with search, packageTier & billingCycle filtering
   */
  router.get('/plans', validateRequest(queryPlansSchema, 'query'), subscriptionController.listPlans);

  /**
   * @route GET /api/v1/subscriptions/plans/stats
   * @desc Aggregate statistics for subscription plans
   */
  router.get('/plans/stats', subscriptionController.getPlanStats);

  /**
   * @route GET /api/v1/subscriptions/plans/:id
   * @desc Get single subscription plan by ID
   */
  router.get('/plans/:id', subscriptionController.getPlanById);

  /**
   * @route PUT /api/v1/subscriptions/plans/:id
   * @desc Update subscription plan details
   */
  router.put('/plans/:id', validateRequest(updatePlanSchema), subscriptionController.updatePlan);

  /**
   * @route DELETE /api/v1/subscriptions/plans/:id
   * @desc Delete subscription plan
   */
  router.delete('/plans/:id', subscriptionController.deletePlan);

  // --- Client Subscription Routes ---

  /**
   * @route POST /api/v1/subscriptions/assign
   * @desc Assign a plan to a client (Active Service start)
   */
  router.post('/assign', validateRequest(assignSubscriptionSchema), subscriptionController.assignSubscription);

  /**
   * @route POST /api/v1/subscriptions/renew
   * @desc Renew client subscription & update renewal date
   */
  router.post('/renew', validateRequest(renewSubscriptionSchema), subscriptionController.renewSubscription);

  /**
   * @route PATCH /api/v1/subscriptions/status
   * @desc Update subscription service status (ACTIVE, SUSPENDED, EXPIRED)
   */
  router.patch('/status', validateRequest(updateSubscriptionStatusSchema), subscriptionController.updateStatus);

  /**
   * @route GET /api/v1/subscriptions/summary
   * @desc KPI summary for Admin Subscriptions dashboard
   */
  router.get('/summary', subscriptionController.getClientSubscriptionSummary);

  /**
   * @route GET /api/v1/subscriptions/clients
   * @desc Get paginated list of client active subscriptions for Admin Panel
   */
  router.get('/clients', validateRequest(queryClientSubscriptionsSchema, 'query'), subscriptionController.listClientSubscriptions);

  /**
   * @route PATCH /api/v1/subscriptions/:id/auto-renew
   * @desc Toggle auto-renewal on a client subscription
   */
  router.patch(
    '/:id/auto-renew',
    validateRequest(updateAutoRenewSchema),
    subscriptionController.setAutoRenewal,
  );

  /**
   * @route GET /api/v1/subscriptions/clients/:clientId
   * @desc Get active subscription details for a specific client
   */
  router.get('/clients/:clientId', subscriptionController.getClientSubscription);

  return router;
};
