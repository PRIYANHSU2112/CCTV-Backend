import { BaseController } from '../../shared/bases/base.controller.js';
import { Messages } from '../../shared/constants/messages.constant.js';

export class SubscriptionController extends BaseController {
  constructor({ subscriptionService }) {
    super();
    this.subscriptionService = subscriptionService;

    this.createPlan = this.createPlan.bind(this);
    this.getPlanById = this.getPlanById.bind(this);
    this.updatePlan = this.updatePlan.bind(this);
    this.deletePlan = this.deletePlan.bind(this);
    this.listPlans = this.listPlans.bind(this);
    this.getPlanStats = this.getPlanStats.bind(this);

    this.assignSubscription = this.assignSubscription.bind(this);
    this.renewSubscription = this.renewSubscription.bind(this);
    this.updateStatus = this.updateStatus.bind(this);
    this.listClientSubscriptions = this.listClientSubscriptions.bind(this);
    this.getClientSubscription = this.getClientSubscription.bind(this);
    this.getClientSubscriptionSummary = this.getClientSubscriptionSummary.bind(this);
    this.setAutoRenewal = this.setAutoRenewal.bind(this);
  }

  // --- Plan Controllers ---

  createPlan = this.catchAsync(async (req, res) => {
    const result = await this.subscriptionService.createPlan({
      ...req.body,
      createdBy: req.user?.id
    });
    return this.sendCreated(res, result, 'Subscription plan created successfully');
  });

  getPlanById = this.catchAsync(async (req, res) => {
    const plan = await this.subscriptionService.getPlanById(req.params.id);
    return this.sendResponse(res, plan, Messages.FETCHED);
  });

  updatePlan = this.catchAsync(async (req, res) => {
    const plan = await this.subscriptionService.updatePlan(req.params.id, req.body);
    return this.sendResponse(res, plan, Messages.UPDATED);
  });

  deletePlan = this.catchAsync(async (req, res) => {
    const result = await this.subscriptionService.deletePlan(req.params.id);
    return this.sendResponse(res, result, Messages.DELETED);
  });

  listPlans = this.catchAsync(async (req, res) => {
    const { items, page, limit, total } = await this.subscriptionService.listPlans(req.query);
    return this.sendPaginated(res, items, page, limit, total, Messages.FETCHED);
  });

  getPlanStats = this.catchAsync(async (req, res) => {
    const stats = await this.subscriptionService.getPlanStats();
    return this.sendResponse(res, stats, Messages.FETCHED);
  });

  // --- Client Subscription Controllers ---

  assignSubscription = this.catchAsync(async (req, res) => {
    const subscription = await this.subscriptionService.assignPlanToClient(req.body);
    return this.sendCreated(res, subscription, 'Subscription assigned to client successfully');
  });

  renewSubscription = this.catchAsync(async (req, res) => {
    const subscription = await this.subscriptionService.renewClientSubscription(req.body);
    return this.sendResponse(res, subscription, 'Client subscription renewed successfully');
  });

  updateStatus = this.catchAsync(async (req, res) => {
    const subscription = await this.subscriptionService.updateSubscriptionStatus(req.body);
    return this.sendResponse(res, subscription, 'Subscription status updated successfully');
  });

  listClientSubscriptions = this.catchAsync(async (req, res) => {
    const { items, page, limit, total } = await this.subscriptionService.listClientSubscriptions(req.query);
    return this.sendPaginated(res, items, page, limit, total, Messages.FETCHED);
  });

  getClientSubscriptionSummary = this.catchAsync(async (req, res) => {
    const summary = await this.subscriptionService.getClientSubscriptionSummary();
    return this.sendResponse(res, summary, Messages.FETCHED);
  });

  setAutoRenewal = this.catchAsync(async (req, res) => {
    const subscription = await this.subscriptionService.setSubscriptionAutoRenewal(
      req.params.id,
      req.body.autoRenewal,
    );
    return this.sendResponse(res, subscription, 'Auto-renewal updated successfully');
  });

  getClientSubscription = this.catchAsync(async (req, res) => {
    const subscription = await this.subscriptionService.getClientActiveSubscription(req.params.clientId);
    return this.sendResponse(res, subscription, Messages.FETCHED);
  });
}
