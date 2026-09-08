import { BaseService } from '../../shared/bases/base.service.js';
import { ConflictError } from '../../shared/errors/conflict.error.js';
import { SystemConstants } from '../../shared/constants/system.constant.js';
import { SubscriptionStatus, PlanStatus } from '../../shared/constants/enum.constant.js';
import { InvoiceModel, InvoiceType, getNextSequenceValue } from '../invoice/invoice.model.js';
import { getFullPdfUrl } from '../../config/env.config.js';

export class SubscriptionService extends BaseService {
  constructor({ subscriptionRepository, redisService }) {
    super();
    this.subscriptionRepository = subscriptionRepository;
    this.redisService = redisService;
  }

  // --- Plan Management ---

  async createPlan(planData) {
    const payload = { ...planData };
    payload.planCode = this.#normalizePlanCode(payload.planCode, payload);

    const existing = await this.subscriptionRepository.findPlanByCode(payload.planCode);
    if (existing) {
      throw new ConflictError(`Subscription plan with code '${payload.planCode}' already exists`);
    }

    // Only persist createdBy when it is a valid ObjectId
    if (payload.createdBy && !/^[a-fA-F0-9]{24}$/.test(String(payload.createdBy))) {
      delete payload.createdBy;
    }

    const plan = await this.subscriptionRepository.createPlan(payload);
    const planObj = plan.toJSON ? plan.toJSON() : plan;

    const cacheKey = `plan:${planObj.id}`;
    await this.redisService.set(cacheKey, planObj, SystemConstants.CACHE_TTL.SHORT);
    try {
      await this.redisService.del('plan:stats');
    } catch {
      // Redis optional
    }

    return planObj;
  }

  #normalizePlanCode(rawCode, planData = {}) {
    let code = String(rawCode || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[-_]+|[-_]+$/g, '');

    if (code.length >= 3) return code.slice(0, 30);

    const tier = String(planData.packageTier || 'PLAN').toUpperCase();
    const cycle = String(planData.billingCycle || 'MONTHLY').toUpperCase();
    const suffix = Date.now().toString(36).toUpperCase().slice(-6);
    return `${tier}_${cycle}_${suffix}`.slice(0, 30);
  }

  async getPlanById(id) {
    const cacheKey = `plan:${id}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return { ...cached, _cached: true };
    }

    const plan = await this.subscriptionRepository.findPlanById(id);
    if (!plan) {
      this.throwNotFound('Subscription Plan');
    }

    const planObj = plan.toJSON ? plan.toJSON() : plan;
    await this.redisService.set(cacheKey, planObj, SystemConstants.CACHE_TTL.SHORT);

    return planObj;
  }

  async updatePlan(id, updateData) {
    const existing = await this.subscriptionRepository.findPlanById(id);
    if (!existing) {
      this.throwNotFound('Subscription Plan');
    }

    const updated = await this.subscriptionRepository.updatePlan(id, updateData);
    const planObj = updated.toJSON ? updated.toJSON() : updated;

    await this.redisService.del(`plan:${id}`);
    return planObj;
  }

  async deletePlan(id) {
    const deleted = await this.subscriptionRepository.deletePlan(id);
    if (!deleted) {
      this.throwNotFound('Subscription Plan');
    }

    await this.redisService.del(`plan:${id}`);
    return { id, deleted: true };
  }

  async listPlans(queryParams = {}) {
    const { page: qPage, limit: qLimit, search, packageTier, billingCycle, status, sortBy, sortOrder } = queryParams;
    const { page, limit, skip } = this.getPaginationParams(qPage, qLimit);

    const statusFilter =
      status && status !== 'all' ? String(status).trim().toUpperCase() : null;

    const { items, total } = await this.subscriptionRepository.findPaginatedPlansWithAggregation({
      skip,
      limit,
      search,
      packageTier: packageTier && packageTier !== 'all' ? packageTier : null,
      billingCycle: billingCycle && billingCycle !== 'all' ? billingCycle : null,
      status: statusFilter,
      sortBy,
      sortOrder
    });

    return { items, page, limit, total };
  }

  async getPlanStats() {
    const cacheKey = 'plan:stats';
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return { ...cached, _cached: true };
    }

    const stats = await this.subscriptionRepository.getPlanStats();
    await this.redisService.set(cacheKey, stats, SystemConstants.CACHE_TTL.SHORT);

    return stats;
  }

  // --- Client Active Subscription Management ---

  /**
   * Assign Subscription Plan to Client
   */
  async assignPlanToClient({ clientId, planId, cameraCount, contractStartDate, autoRenewal }) {
    const plan = await this.subscriptionRepository.findPlanById(planId);
    if (!plan || plan.status !== PlanStatus.ACTIVE) {
      this.throwBadRequest('Active subscription plan not found');
    }

    const startDate = contractStartDate ? new Date(contractStartDate) : new Date();

    // Calculate renewal date based on duration in months
    const renewalDate = new Date(startDate);
    renewalDate.setMonth(renewalDate.getMonth() + plan.durationInMonths);

    const activeCameras = cameraCount || plan.maxCameras;
    const monthlyCharge = Math.round((plan.totalPrice / plan.durationInMonths) * 100) / 100;

    const subscription = await this.subscriptionRepository.createSubscription({
      clientId,
      planId,
      packageTier: plan.packageTier,
      cameraCount: activeCameras,
      monthlyCharge,
      contractStartDate: startDate,
      renewalDate,
      autoRenewal: autoRenewal !== undefined ? autoRenewal : plan.autoRenewalSupported,
      status: SubscriptionStatus.ACTIVE,
      lastPaymentDate: new Date()
    });

    const subObj = subscription.toJSON ? subscription.toJSON() : subscription;
    await this.redisService.set(`sub:client:${clientId}`, subObj, SystemConstants.CACHE_TTL.SHORT);

    return subObj;
  }

  /**
   * Renew Subscription Plan for Client
   */
  async renewClientSubscription({ subscriptionId, monthsToExtend }) {
    const subscription = await this.subscriptionRepository.findSubscriptionById(subscriptionId);
    if (!subscription) {
      this.throwNotFound('Client Subscription');
    }

    const duration = monthsToExtend || subscription.planId?.durationInMonths || 1;
    const currentRenewal = new Date(subscription.renewalDate);
    const baseDate = currentRenewal > new Date() ? currentRenewal : new Date();

    baseDate.setMonth(baseDate.getMonth() + duration);

    const updated = await this.subscriptionRepository.updateSubscription(subscriptionId, {
      renewalDate: baseDate,
      status: SubscriptionStatus.ACTIVE,
      lastPaymentDate: new Date(),
      suspendedAt: null
    });

    const subObj = updated.toJSON ? updated.toJSON() : updated;
    const userId = subscription.clientId?._id || subscription.clientId;

    // Auto-generate Renewal Invoice
    try {
      const seq = await getNextSequenceValue('invoiceNumber');
      const year = new Date().getFullYear();
      const invoiceNumber = `INV-${year}-${seq.toString().padStart(5, '0')}`;
      const planGstRate = subscription.planId?.gstPercentage !== undefined
        ? Number(subscription.planId.gstPercentage)
        : (subscription.gstPercentage !== undefined ? Number(subscription.gstPercentage) : 0);

      const gst = calculateGstFromExclusive(subtotal, planGstRate, false);

      await InvoiceModel.create({
        invoiceNumber,
        clientId: userId,
        subscriptionId: subscription._id || subscriptionId,
        invoiceType: InvoiceType.RENEWAL,
        items: [
          {
            description: `${packageTier} CCTV Subscription Renewal (${duration} Month${duration > 1 ? 's' : ''})`,
            hsnSac: '998529',
            quantity: 1,
            unitPrice: subtotal,
            amount: subtotal
          }
        ],
        currency: 'INR',
        subtotal: gst.baseAmount,
        taxPercentage: planGstRate,
        taxAmount: gst.gstAmount,
        cgstAmount: gst.cgstAmount,
        sgstAmount: gst.sgstAmount,
        igstAmount: gst.igstAmount,
        totalAmount: gst.totalAmount,
        amountPaid: 0,
        amountDue: gst.totalAmount,
        status: 'UNPAID',
        issueDate: new Date(),
        dueDate: baseDate,
        pdfUrl: null,
        pdfStatus: 'PENDING',
        notes: `Subscription renewed for ${duration} month(s)`
      });
    } catch {
      // Safe fallback if auto-invoice fails
    }

    try {
      await this.redisService.del(`sub:client:${userId}`);
      await this.redisService.del('sub:summary');
    } catch {
      // Redis optional
    }

    return subObj;
  }

  /**
   * Change Client Service Status (e.g., ACTIVE, SUSPENDED)
   */
  async updateSubscriptionStatus({ subscriptionId, status }) {
    const updateData = { status };
    if (status === SubscriptionStatus.SUSPENDED) {
      updateData.suspendedAt = new Date();
    } else if (status === SubscriptionStatus.ACTIVE) {
      updateData.suspendedAt = null;
    }

    const updated = await this.subscriptionRepository.updateSubscription(subscriptionId, updateData);
    if (!updated) {
      this.throwNotFound('Client Subscription');
    }

    const subObj = updated.toJSON ? updated.toJSON() : updated;
    const userId = updated.clientId?._id || updated.clientId;
    try {
      await this.redisService.del(`sub:client:${userId}`);
      await this.redisService.del('sub:summary');
    } catch {
      // Redis optional
    }

    return subObj;
  }

  /**
   * Normalize Admin UI status labels (Active) to API enums (ACTIVE)
   */
  #normalizeSubscriptionStatus(status) {
    if (!status || status === 'all') return null;
    const map = {
      Active: SubscriptionStatus.ACTIVE,
      ACTIVE: SubscriptionStatus.ACTIVE,
      Expired: SubscriptionStatus.EXPIRED,
      EXPIRED: SubscriptionStatus.EXPIRED,
      Suspended: SubscriptionStatus.SUSPENDED,
      SUSPENDED: SubscriptionStatus.SUSPENDED,
      Due: SubscriptionStatus.DUE,
      DUE: SubscriptionStatus.DUE,
      Cancelled: SubscriptionStatus.CANCELLED,
      CANCELLED: SubscriptionStatus.CANCELLED,
    };
    return map[status] || String(status).toUpperCase();
  }

  #normalizeBillingCycle(cycle) {
    if (!cycle || cycle === 'all') return null;
    const map = {
      Monthly: 'MONTHLY',
      MONTHLY: 'MONTHLY',
      Quarterly: 'QUARTERLY',
      QUARTERLY: 'QUARTERLY',
      'Half-Yearly': 'HALF_YEARLY',
      HALF_YEARLY: 'HALF_YEARLY',
      Yearly: 'YEARLY',
      YEARLY: 'YEARLY',
    };
    return map[cycle] || String(cycle).toUpperCase().replace(/[\s-]+/g, '_');
  }

  /**
   * List Client Subscriptions for Admin Dashboard
   */
  async listClientSubscriptions(queryParams = {}) {
    const {
      page: qPage,
      limit: qLimit,
      search,
      packageTier,
      billingCycle,
      status,
      sortBy,
      sortOrder,
    } = queryParams;
    const { page, limit, skip } = this.getPaginationParams(qPage, qLimit);

    const { items, total } = await this.subscriptionRepository.findPaginatedClientSubscriptionsWithAggregation({
      skip,
      limit,
      search,
      packageTier: packageTier && packageTier !== 'all' ? packageTier : null,
      billingCycle: this.#normalizeBillingCycle(billingCycle),
      status: this.#normalizeSubscriptionStatus(status),
      sortBy,
      sortOrder
    });

    return { items, page, limit, total };
  }

  async getClientSubscriptionSummary(rawStatus = null) {
    const status = this.#normalizeSubscriptionStatus(rawStatus);
    const cacheKey = status ? `sub:summary:${status}` : 'sub:summary';
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) return { ...cached, _cached: true };
    } catch {
      // Redis optional
    }

    const summary = await this.subscriptionRepository.getClientSubscriptionSummary(status);
    try {
      await this.redisService.set(cacheKey, summary, SystemConstants.CACHE_TTL.SHORT);
    } catch {
      // Redis optional
    }
    return summary;
  }

  async setSubscriptionAutoRenewal(subscriptionId, autoRenewal) {
    const existing = await this.subscriptionRepository.findSubscriptionById(subscriptionId);
    if (!existing) {
      this.throwNotFound('Client Subscription');
    }

    const updated = await this.subscriptionRepository.updateSubscription(subscriptionId, {
      autoRenewal: Boolean(autoRenewal),
    });
    const subObj = updated.toJSON ? updated.toJSON() : updated;

    const userId = existing.clientId?._id || existing.clientId;
    try {
      await this.redisService.del(`sub:client:${userId}`);
      await this.redisService.del('sub:summary');
    } catch {
      // Redis optional
    }

    return subObj;
  }

  /**
   * Fetch Active Subscription for Client
   */
  async getClientActiveSubscription(clientId) {
    const cacheKey = `sub:client:${clientId}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return { ...cached, _cached: true };
    }

    const subscription = await this.subscriptionRepository.findActiveSubscriptionByClient(clientId);
    if (!subscription) {
      this.throwNotFound('Active Client Subscription');
    }

    const subObj = subscription.toJSON ? subscription.toJSON() : subscription;
    await this.redisService.set(cacheKey, subObj, SystemConstants.CACHE_TTL.SHORT);

    return subObj;
  }
}
