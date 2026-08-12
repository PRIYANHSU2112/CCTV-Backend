import { BaseService } from '../../shared/bases/base.service.js';
import { ConflictError } from '../../shared/errors/conflict.error.js';
import { SystemConstants } from '../../shared/constants/system.constant.js';
import {
  UserRole,
  UserStatus,
  ClientStatus,
  PackageTier,
  BillingCycle,
  SubscriptionStatus,
} from '../../shared/constants/enum.constant.js';
import {
  normalizeGstin,
  normalizeBillingCycle,
  normalizePackageTier,
  PACKAGE_CAMERA_COUNTS,
  BILLING_CYCLE_MONTHS,
} from '../../shared/utils/gstin.util.js';
import { InvoiceModel } from '../invoice/invoice.model.js';
import { PaymentTransactionModel } from '../payment/payment-transaction.model.js';
import { ReminderRuleModel } from '../reminder/reminder.model.js';
import { ClientSubscriptionModel } from '../subscription/client-subscription.model.js';

export class ClientService extends BaseService {
  constructor({ clientRepository, userRepository, hashService, subscriptionRepository = null, redisService }) {
    super();
    this.clientRepository = clientRepository;
    this.userRepository = userRepository;
    this.hashService = hashService;
    this.subscriptionRepository = subscriptionRepository;
    this.redisService = redisService;
  }

  /**
   * Onboard a new Client: Creates User Auth Identity + Client Profile (+ optional subscription)
   */
  async registerClient(clientData) {
    const {
      name,
      phone,
      email,
      password,
      businessName,
      gstin,
      address,
      city,
      pincode,
      state,
      planId: rawPlanId,
      packageTier: rawTier,
      packageId,
      billingCycle: rawCycle,
      plan,
      monthlyCharge,
      cameras,
      autoRenew,
      contractStart,
      renewalDate,
    } = clientData;

    const safePhone = phone ? String(phone).trim() : '';
    const safeName = name ? String(name).trim() : 'Contact Person';
    const safeBusinessName = businessName ? String(businessName).trim() : 'Business Account';
    const safeGstin = normalizeGstin(gstin);

    if (!this.subscriptionRepository?.createSubscription) {
      this.throwBadRequest('Subscription service unavailable; cannot onboard client with a plan');
    }

    // Prefer explicit SubscriptionPlan id from Admin form
    let planDoc = null;
    const planId = rawPlanId ? String(rawPlanId).trim() : '';
    if (planId) {
      if (!this.subscriptionRepository.findPlanById) {
        this.throwBadRequest('Subscription service unavailable; cannot resolve plan');
      }
      planDoc = await this.subscriptionRepository.findPlanById(planId);
      if (!planDoc) {
        this.throwNotFound('Subscription plan');
      }
    }

    const packageTier = planDoc
      ? normalizePackageTier(planDoc.packageTier)
      : normalizePackageTier(rawTier || packageId || PackageTier.BASIC);
    const billingCycle = planDoc
      ? normalizeBillingCycle(planDoc.billingCycle)
      : normalizeBillingCycle(rawCycle || plan || BillingCycle.MONTHLY);

    let user = await this.userRepository.findByPhone(safePhone);
    if (user) {
      const existingClient = await this.clientRepository.findByUserId(user._id);
      if (existingClient) {
        throw new ConflictError(`Client account with phone number '${safePhone}' already exists`);
      }
    } else {
      const defaultPassword = password || 'Client@123';
      const hashedPassword = await this.hashService.hashPassword(defaultPassword);

      user = await this.userRepository.create({
        name: safeName,
        phone: safePhone,
        email: email ? String(email).trim().toLowerCase() : undefined,
        password: hashedPassword,
        role: UserRole.CLIENT,
        status: UserStatus.ACTIVE,
      });
    }

    const client = await this.clientRepository.create({
      userId: user._id,
      businessName: safeBusinessName,
      gstin: safeGstin,
      installationAddress: {
        address: address ? String(address).trim() : 'Main Address',
        city: city ? String(city).trim() : 'City',
        pincode: pincode ? String(pincode).trim() : '000000',
        state: state || 'Madhya Pradesh',
      },
      status: ClientStatus.ACTIVE,
    });

    const cameraCount =
      Number(cameras) ||
      planDoc?.maxCameras ||
      PACKAGE_CAMERA_COUNTS[packageTier] ||
      4;
    const charge =
      Number(monthlyCharge) > 0
        ? Number(monthlyCharge)
        : Number(planDoc?.basePrice) > 0
          ? Number(planDoc.basePrice)
          : 1499;
    const months = BILLING_CYCLE_MONTHS[billingCycle] || planDoc?.durationInMonths || 1;
    const startDate = contractStart ? new Date(contractStart) : new Date();
    const computedRenewal = renewalDate
      ? new Date(renewalDate)
      : (() => {
          const d = new Date(startDate);
          d.setMonth(d.getMonth() + months);
          return d;
        })();

    if (!planDoc) {
      planDoc = await this.#ensurePlanForClientOnboarding({
        packageTier,
        billingCycle,
        monthlyCharge: charge,
        cameras: cameraCount,
        packageName: clientData.packageName,
      });
    }

    const subscription = await this.subscriptionRepository.createSubscription({
      clientId: user._id,
      planId: planDoc._id || planDoc.id,
      packageTier,
      cameraCount,
      monthlyCharge: charge,
      contractStartDate: startDate,
      renewalDate: computedRenewal,
      autoRenewal: autoRenew !== undefined ? Boolean(autoRenew) : true,
      status: SubscriptionStatus.ACTIVE,
      lastPaymentDate: new Date(),
    });

    const subId = subscription._id || subscription.id;
    await this.clientRepository.update(client._id || client.id, {
      currentSubscriptionId: subId,
      totalCamerasInstalled: cameraCount,
    });

    try {
      await this.redisService.del('sub:summary');
      await this.redisService.set(
        `sub:client:${user._id}`,
        subscription.toJSON ? subscription.toJSON() : subscription,
        SystemConstants.CACHE_TTL.SHORT,
      );
    } catch {
      // Redis optional
    }

    const refreshed = await this.clientRepository.findById(client._id || client.id);
    const clientObj = refreshed?.toJSON
      ? refreshed.toJSON()
      : client.toJSON
        ? client.toJSON()
        : client;

    try {
      await this.redisService.set(`client:${clientObj.id}`, clientObj, SystemConstants.CACHE_TTL.SHORT);
      await this.redisService.del('client:stats');
    } catch {
      // Safe Redis bypass
    }

    const subObj = subscription?.toJSON ? subscription.toJSON() : subscription;

    return {
      ...clientObj,
      id: clientObj.id || clientObj._id,
      name: safeName,
      phone: safePhone,
      email: email ? String(email).trim().toLowerCase() : undefined,
      address: clientObj.installationAddress?.address,
      city: clientObj.installationAddress?.city,
      pincode: clientObj.installationAddress?.pincode,
      packageTier,
      plan: billingCycle,
      monthlyCharge: charge,
      cameras: cameraCount,
      currentSubscriptionId: subObj?.id || subId,
      subscription: subObj
        ? {
            id: subObj.id || subId,
            packageTier,
            billingCycle,
            monthlyCharge: charge,
            cameraCount,
            renewalDate: computedRenewal,
            status: SubscriptionStatus.ACTIVE,
            autoRenewal: autoRenew !== undefined ? Boolean(autoRenew) : true,
          }
        : null,
      user: {
        id: user._id.toString(),
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
      },
    };
  }

  /**
   * Resolve an ACTIVE plan for onboarding; create one from form pricing if missing.
   */
  async #ensurePlanForClientOnboarding({
    packageTier,
    billingCycle,
    monthlyCharge,
    cameras,
    packageName,
  }) {
    let plan = await this.subscriptionRepository.findPlanByTierAndCycle(
      packageTier,
      billingCycle,
    );
    if (plan) return plan;

    if (this.subscriptionRepository.findActivePlanByTier) {
      plan = await this.subscriptionRepository.findActivePlanByTier(packageTier);
      // Prefer exact billing cycle; only reuse tier plan if cycle matches
      if (plan && plan.billingCycle === billingCycle) return plan;
    }

    const months = BILLING_CYCLE_MONTHS[billingCycle] || 1;
    const codeSuffix = Date.now().toString(36).toUpperCase().slice(-6);
    const planCode = `${packageTier}_${billingCycle}_${codeSuffix}`.slice(0, 30);
    const name = `${packageName || packageTier} ${billingCycle.replace('_', ' ')}`.slice(0, 100);

    return this.subscriptionRepository.createPlan({
      name: name.length >= 3 ? name : `${packageTier} Plan`,
      planCode,
      packageTier,
      billingCycle,
      durationInMonths: months,
      basePrice: monthlyCharge,
      gstPercentage: 18,
      maxCameras: cameras,
      features: [`Up to ${cameras} cameras`, `${billingCycle} billing`],
      autoRenewalSupported: true,
      status: 'ACTIVE',
    });
  }

  async getClientById(id) {
    const cacheKey = `client:${id}`;

    try {
      const cachedClient = await this.redisService.get(cacheKey);
      if (cachedClient) {
        return { ...cachedClient, _cached: true };
      }
    } catch {
      // Safe Redis bypass
    }

    const client = await this.clientRepository.findById(id);
    if (!client) {
      this.throwNotFound('Client');
    }

    const clientObj = this.#mapClientDetail(client);
    try {
      await this.redisService.set(cacheKey, clientObj, SystemConstants.CACHE_TTL.SHORT);
    } catch {
      // Safe Redis bypass
    }

    return clientObj;
  }

  /**
   * Client detail dashboard for Admin ClientDetailPage
   */
  async getClientDashboard(id) {
    const client = await this.clientRepository.findById(id);
    if (!client) {
      this.throwNotFound('Client');
    }

    const clientObj = this.#mapClientDetail(client);
    const userId = client.userId?._id || client.userId;

    let subscriptions = [];
    if (this.subscriptionRepository?.findSubscriptionsByClientUserId && userId) {
      const rows = await this.subscriptionRepository.findSubscriptionsByClientUserId(userId);
      subscriptions = (rows || []).map((s) => {
        const row = s.toJSON ? s.toJSON() : s;
        return {
          id: row.id || row._id?.toString(),
          clientId: id,
          clientName: clientObj.name,
          plan: row.planId?.billingCycle || row.packageTier || clientObj.plan,
          packageName: row.planId?.name || row.packageTier,
          packageTier: row.packageTier,
          status: row.status,
          autoRenew: row.autoRenewal,
          startDate: row.contractStartDate,
          renewalDate: row.renewalDate,
          amount: row.monthlyCharge,
          cameras: row.cameraCount,
          lastPaymentDate: row.lastPaymentDate,
        };
      });
    } else if (client.currentSubscriptionId) {
      const sub = client.currentSubscriptionId;
      const row = sub.toJSON ? sub.toJSON() : sub;
      subscriptions = [
        {
          id: row.id || row._id?.toString(),
          clientId: id,
          clientName: clientObj.name,
          plan: row.packageTier,
          packageName: row.packageTier,
          status: row.status,
          autoRenew: row.autoRenewal,
          startDate: row.contractStartDate,
          renewalDate: row.renewalDate,
          amount: row.monthlyCharge,
          cameras: row.cameraCount,
        },
      ];
    }

    const activeSub = subscriptions[0];
    const renewal = activeSub?.renewalDate
      ? new Date(activeSub.renewalDate)
      : clientObj.renewalDate
        ? new Date(clientObj.renewalDate)
        : null;
    const today = new Date();
    const daysOverdue =
      clientObj.status === 'Overdue' || clientObj.status === 'Suspended'
        ? Math.max(0, renewal ? Math.floor((today - renewal) / 86400000) : 0)
        : 0;

    const totalPaid = subscriptions.reduce((sum, s) => {
      return s.lastPaymentDate ? sum + Number(s.amount || 0) : sum;
    }, 0);

    const outstanding =
      clientObj.status === 'Overdue' || clientObj.status === 'Due'
        ? Number(clientObj.monthlyCharge || 0)
        : 0;

    return {
      client: {
        ...clientObj,
        outstanding,
      },
      kpis: {
        totalPaid,
        outstanding,
        invoicesCount: 0,
        paymentSuccessRate: 100,
        daysOverdue,
        cameras: clientObj.cameras,
      },
      paymentTimeline: activeSub?.lastPaymentDate
        ? [
          {
            date: activeSub.lastPaymentDate,
            amount: activeSub.amount,
            status: 'Paid',
            method: 'Gateway',
          },
        ]
        : [],
      invoiceBreakdown: [
        { status: 'Paid', count: totalPaid > 0 ? 1 : 0 },
        { status: 'Partial', count: 0 },
        { status: 'Unpaid', count: 0 },
        { status: 'Overdue', count: clientObj.status === 'Overdue' ? 1 : 0 },
        { status: 'Cancelled', count: 0 },
      ],
      reminderStats: { sent: 0, queued: 0, failed: 0 },
      payments: [],
      invoices: [],
      reminders: [],
      activity: [
        {
          id: `ACT-${id}`,
          type: 'client',
          message: `Client profile loaded for ${clientObj.businessName}`,
          at: clientObj.updatedAt || clientObj.createdAt || new Date().toISOString(),
        },
      ],
      subscriptions,
    };
  }

  #mapClientDetail(client) {
    const raw = client.toJSON ? client.toJSON() : client;
    const user = raw.userId && typeof raw.userId === 'object' ? raw.userId : null;
    const sub =
      raw.currentSubscriptionId && typeof raw.currentSubscriptionId === 'object'
        ? raw.currentSubscriptionId
        : null;

    return {
      id: raw.id || raw._id?.toString(),
      name: user?.name || 'Contact Person',
      businessName: raw.businessName,
      email: user?.email || 'N/A',
      phone: user?.phone || 'N/A',
      city: raw.installationAddress?.city || 'N/A',
      address: raw.installationAddress?.address || 'N/A',
      pincode: raw.installationAddress?.pincode || 'N/A',
      state: raw.installationAddress?.state || 'Madhya Pradesh',
      gstin: raw.gstin || '',
      cameras: raw.totalCamerasInstalled || raw.cameras?.length || sub?.cameraCount || 0,
      status: raw.status || ClientStatus.ACTIVE,
      plan: sub?.packageTier || 'BASIC',
      packageTier: sub?.packageTier || 'BASIC',
      monthlyCharge: sub?.monthlyCharge || 0,
      renewalDate: sub?.renewalDate || null,
      nextDueDate: sub?.renewalDate || null,
      contractStart: sub?.contractStartDate || raw.createdAt || null,
      autoRenew: sub?.autoRenewal !== undefined ? sub.autoRenewal : true,
      outstanding: 0,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      userId: user?.id || user?._id || raw.userId,
    };
  }

  async updateClient(id, updateData) {
    const existing = await this.clientRepository.findById(id);
    if (!existing) {
      this.throwNotFound('Client');
    }

    if (existing.userId && (updateData.name || updateData.phone || updateData.email)) {
      const userUpdates = {};
      if (updateData.name) userUpdates.name = updateData.name;
      if (updateData.email) userUpdates.email = updateData.email;
      if (updateData.phone && updateData.phone !== existing.userId.phone) {
        const phoneTaken = await this.userRepository.findByPhone(updateData.phone);
        if (phoneTaken) {
          throw new ConflictError(`Phone number '${updateData.phone}' is already registered`);
        }
        userUpdates.phone = updateData.phone;
      }
      await this.userRepository.update(existing.userId._id, userUpdates);
    }

    const clientUpdates = {};
    if (updateData.businessName) clientUpdates.businessName = updateData.businessName;
    if (updateData.gstin !== undefined) {
      clientUpdates.gstin = normalizeGstin(updateData.gstin);
    }
    if (updateData.status) clientUpdates.status = updateData.status;

    if (updateData.address || updateData.city || updateData.pincode || updateData.state) {
      clientUpdates.installationAddress = {
        address: updateData.address || existing.installationAddress?.address,
        city: updateData.city || existing.installationAddress?.city,
        pincode: updateData.pincode || existing.installationAddress?.pincode,
        state: updateData.state || existing.installationAddress?.state,
      };
    }

    const updatedClient = await this.clientRepository.update(id, clientUpdates);
    const clientObj = this.#mapClientDetail(updatedClient);

    await this.redisService.del(`client:${id}`);
    await this.redisService.del('client:stats');

    return clientObj;
  }

  async updateClientStatus(id, status) {
    const updatedClient = await this.clientRepository.updateStatus(id, status);
    if (!updatedClient) {
      this.throwNotFound('Client');
    }

    const clientObj = this.#mapClientDetail(updatedClient);
    await this.redisService.del(`client:${id}`);
    await this.redisService.del('client:stats');

    return clientObj;
  }

  async addCameraToClient(id, cameraData) {
    const updatedClient = await this.clientRepository.addCamera(id, cameraData);
    if (!updatedClient) {
      this.throwNotFound('Client');
    }

    const clientObj = this.#mapClientDetail(updatedClient);
    await this.redisService.del(`client:${id}`);
    await this.redisService.del('client:stats');

    return clientObj;
  }

  async deleteClient(id) {
    const client = await this.clientRepository.delete(id);
    if (!client) {
      this.throwNotFound('Client');
    }

    await this.redisService.del(`client:${id}`);
    await this.redisService.del('client:stats');
    return { id, deleted: true };
  }

  async listClients(queryParams = {}) {
    const { page: qPage, limit: qLimit, search, city, status, hasSubscription, sortBy, sortOrder } = queryParams;
    const { page, limit, skip } = this.getPaginationParams(qPage, qLimit);

    const { items, total } = await this.clientRepository.findPaginatedClientsWithAggregation({
      skip,
      limit,
      search,
      city,
      status,
      hasSubscription,
      sortBy,
      sortOrder,
    });

    return { items, page, limit, total };
  }

  async getClientStats() {
    const cacheKey = 'client:stats';
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return { ...cached, _cached: true };
    }

    const stats = await this.clientRepository.getClientStats();
    await this.redisService.set(cacheKey, stats, SystemConstants.CACHE_TTL.SHORT);

    return stats;
  }

  /**
   * Comprehensive Client Dashboard & Analytics API
   * Fetches real client details, payment transactions, invoices, reminders, subscriptions, KPIs, and activity timeline.
   */
  async getClientDashboard(id) {
    const client = await this.clientRepository.findById(id);
    if (!client) {
      this.throwNotFound('Client');
    }

    const clientObj = this.#mapClientDetail(client);
    const clientMongoId = client._id || client.id;
    const userMongoId = client.userId?._id || client.userId;

    const idFilter = [];
    if (clientMongoId) idFilter.push({ clientId: clientMongoId });
    if (userMongoId) idFilter.push({ clientId: userMongoId });

    // Fetch Invoices, Payments, Reminders, and Subscriptions concurrently
    const [rawInvoices, rawPayments, rawReminders, rawSubscriptions] = await Promise.all([
      InvoiceModel.find({ $or: idFilter }).sort({ createdAt: -1 }).lean().exec(),
      PaymentTransactionModel.find({ $or: idFilter }).sort({ paidAt: -1, createdAt: -1 }).lean().exec(),
      ReminderRuleModel.find({ $or: idFilter }).sort({ createdAt: -1 }).lean().exec(),
      ClientSubscriptionModel.find({ $or: idFilter }).populate('planId').sort({ createdAt: -1 }).lean().exec(),
    ]);

    // Map Invoices
    const invoices = rawInvoices.map((inv) => {
      const total = Number(inv.totalAmount || inv.total || 0);
      const paid = Number(inv.amountPaid || 0);
      const balance = inv.amountDue !== undefined ? Number(inv.amountDue) : Math.max(0, total - paid);
      return {
        id: inv.invoiceNumber || String(inv._id),
        _id: String(inv._id),
        invoiceNumber: inv.invoiceNumber,
        invoiceType: inv.invoiceType || 'NEW_PLAN',
        issueDate: inv.issueDate || inv.createdAt,
        dueDate: inv.dueDate || inv.createdAt,
        status: inv.status || 'UNPAID',
        total,
        amountPaid: paid,
        balance,
        gstin: inv.gstin || clientObj.gstin || 'N/A',
        taxableAmount: inv.subtotal || 0,
        cgst: inv.cgst || 0,
        sgst: inv.sgst || 0,
        lineItems: inv.items || [],
        createdAt: inv.createdAt,
      };
    });

    // Map Payments
    const payments = rawPayments.map((p) => ({
      id: String(p._id),
      receiptNo: p.receiptNo || `REC-${String(p._id).slice(-6).toUpperCase()}`,
      method: p.method || 'CASH',
      status: p.status || 'PAID',
      amount: Number(p.amount || 0),
      paidAt: p.paidAt || p.createdAt,
      note: p.note || '',
      createdAt: p.createdAt,
    }));

    // Map Reminders
    const reminders = rawReminders.map((r) => ({
      id: String(r._id),
      channel: Array.isArray(r.channels) ? r.channels.join(', ') : r.channels || 'WhatsApp',
      offsetLabel: r.isRecurring ? `Every ${r.repeatEveryDays || 3} days` : 'Scheduled',
      status: r.status || 'Active',
      scheduledFor: r.scheduledFor || r.nextTriggerAt || r.createdAt,
      sentAt: r.lastTriggerAt || null,
      message: r.messageTemplate || r.title || 'Payment Reminder',
      createdAt: r.createdAt,
    }));

    // Map Subscriptions
    const subscriptions = rawSubscriptions.map((sub) => ({
      id: String(sub._id),
      plan: sub.billingCycle || sub.planId?.billingCycle || clientObj.plan || 'MONTHLY',
      packageName: sub.packageTier || sub.planId?.packageTier || clientObj.packageTier || 'BASIC',
      status: sub.status || 'ACTIVE',
      startDate: sub.contractStartDate || sub.createdAt,
      renewalDate: sub.renewalDate,
      amount: Number(sub.monthlyCharge || 0),
      createdAt: sub.createdAt,
    }));

    // Build Activity Timeline
    const activity = [];

    if (client.createdAt) {
      activity.push({
        id: `act-onboarded-${client._id}`,
        type: 'Client',
        title: `Client account "${client.businessName}" created`,
        at: client.createdAt,
        meta: `Status: ${client.status || 'Active'}`,
      });
    }

    invoices.forEach((inv) => {
      activity.push({
        id: `act-inv-${inv._id}`,
        type: 'Invoice',
        title: `Invoice ${inv.invoiceNumber || inv.id} generated`,
        at: inv.createdAt || inv.issueDate,
        meta: `₹${inv.total} | Status: ${inv.status}`,
      });
    });

    payments.forEach((p) => {
      activity.push({
        id: `act-pay-${p.id}`,
        type: 'Payment',
        title: `Payment received (${p.receiptNo})`,
        at: p.paidAt || p.createdAt,
        meta: `₹${p.amount} via ${p.method}`,
      });
    });

    reminders.forEach((r) => {
      activity.push({
        id: `act-rem-${r.id}`,
        type: 'Reminder',
        title: `Reminder: ${r.message}`,
        at: r.createdAt,
        meta: `Channels: ${r.channel} | Status: ${r.status}`,
      });
    });

    activity.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    const totalPaid = payments
      .filter((p) => p.status === 'PAID')
      .reduce((sum, p) => sum + p.amount, 0);

    const outstanding = invoices
      .filter((inv) => ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE'].includes(inv.status))
      .reduce((sum, inv) => sum + inv.balance, 0);

    const paymentSuccessRate = payments.length
      ? Math.round((payments.filter((p) => p.status === 'PAID').length / payments.length) * 100)
      : 100;

    const paymentTimeline = payments.map((p) => ({
      date: p.paidAt,
      amount: p.amount,
    }));

    const statusCounts = { Paid: 0, Partial: 0, Unpaid: 0, Overdue: 0, Cancelled: 0 };
    invoices.forEach((inv) => {
      const s = String(inv.status).toUpperCase();
      if (s === 'PAID') statusCounts.Paid += 1;
      else if (s === 'PARTIALLY_PAID') statusCounts.Partial += 1;
      else if (s === 'OVERDUE') statusCounts.Overdue += 1;
      else if (s === 'CANCELLED') statusCounts.Cancelled += 1;
      else statusCounts.Unpaid += 1;
    });

    const invoiceBreakdown = Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count,
    }));

    return {
      client: {
        ...clientObj,
        outstanding,
      },
      kpis: {
        totalPaid,
        outstanding,
        invoicesCount: invoices.length,
        paymentSuccessRate,
        daysOverdue: 0,
        cameras: clientObj.cameras || 0,
      },
      paymentTimeline,
      invoiceBreakdown,
      reminderStats: {
        sent: reminders.filter((r) => r.status === 'Completed' || r.sentAt).length,
        queued: reminders.filter((r) => r.status === 'Active' && !r.sentAt).length,
        failed: reminders.filter((r) => r.status === 'Failed').length,
      },
      payments,
      invoices,
      reminders,
      activity,
      subscriptions,
    };
  }
}
