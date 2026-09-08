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
import { CheckoutSessionModel } from '../payment/checkout-session.model.js';
import { ReminderRuleModel } from '../reminder/reminder.model.js';
import { ClientSubscriptionModel } from '../subscription/client-subscription.model.js';
import { CompanyModel } from '../company/company.model.js';
import { roundMoney } from '../../shared/utils/money.util.js';

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

    const cleanDigits = phone ? String(phone).replace(/\D/g, '') : '';
    const safePhone = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;
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
      if (email && !user.email) {
        await this.userRepository.update(user._id, { email: String(email).trim().toLowerCase() }).catch(() => {});
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

    const clientEmail = email ? String(email).trim().toLowerCase() : (user.email || undefined);

    const client = await this.clientRepository.create({
      userId: user._id,
      email: clientEmail,
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
        gstPercentage: clientData.gstPercentage !== undefined ? clientData.gstPercentage : clientData.taxPercentage,
      });
    }

    const planGstRate = planDoc?.gstPercentage !== undefined
      ? Number(planDoc.gstPercentage)
      : (clientData.gstPercentage !== undefined ? Number(clientData.gstPercentage) : 0);

    const totalPlanCharge = planDoc?.totalPrice !== undefined
      ? Number(planDoc.totalPrice)
      : Math.round(charge * months * (1 + planGstRate / 100) * 100) / 100;

    // Resolve installation charge
    let installBase = 0;
    let installGst = 0;
    let installHsnSac = '995469';

    const shouldApplyInstallation = clientData.applyInstallationCharge !== undefined
      ? Boolean(clientData.applyInstallationCharge)
      : (clientData.installationCharge !== undefined && Number(clientData.installationCharge) > 0);

    if (shouldApplyInstallation) {
      let companyDoc = null;
      try {
        companyDoc = await CompanyModel.findOne().lean().exec();
      } catch {
        // Safe fallback
      }

      installBase = clientData.installationCharge !== undefined && clientData.installationCharge !== null
        ? roundMoney(Number(clientData.installationCharge))
        : Number(companyDoc?.installationCharge !== undefined ? companyDoc.installationCharge : (companyDoc?.financialDefaults?.installationCharge ?? 6000));

      installHsnSac = clientData.installationHsnSac || companyDoc?.installationHsnSac || companyDoc?.financialDefaults?.installationHsnSac || '995469';

      const installGstEnabled = companyDoc?.installationGstEnabled !== undefined
        ? Boolean(companyDoc.installationGstEnabled)
        : (companyDoc?.financialDefaults?.installationGstEnabled !== undefined
            ? Boolean(companyDoc.financialDefaults.installationGstEnabled)
            : true);

      const installGstRate = Number(
        companyDoc?.installationGstRate !== undefined
          ? companyDoc.installationGstRate
          : (companyDoc?.financialDefaults?.installationGstRate ?? 18)
      );

      installGst = clientData.installationGst !== undefined && clientData.installationGst !== null
        ? roundMoney(Number(clientData.installationGst))
        : (installGstEnabled ? roundMoney(installBase * (installGstRate / 100)) : 0);
    }

    const totalInstallationCharge = roundMoney(installBase + installGst);
    const finalOrderPrice = roundMoney(totalPlanCharge + totalInstallationCharge);

    const subscription = await this.subscriptionRepository.createSubscription({
      clientId: user._id,
      planId: planDoc._id || planDoc.id,
      packageTier,
      cameraCount,
      monthlyCharge: charge,
      totalPlanPrice: finalOrderPrice,
      installationCharge: installBase,
      installationHsnSac: installHsnSac,
      installationGst: installGst,
      gstPercentage: planGstRate,
      paidAmount: 0,
      remainingAmount: finalOrderPrice,
      durationInMonths: months,
      contractStartDate: startDate,
      renewalDate: computedRenewal,
      autoRenewal: autoRenew !== undefined ? Boolean(autoRenew) : true,
      status: SubscriptionStatus.ACTIVE,
      lastPaymentDate: null,
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
    gstPercentage,
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
    const gstRate = gstPercentage !== undefined ? Number(gstPercentage) : 0;

    return this.subscriptionRepository.createPlan({
      name: name.length >= 3 ? name : `${packageTier} Plan`,
      planCode,
      packageTier,
      billingCycle,
      durationInMonths: months,
      basePrice: monthlyCharge,
      gstPercentage: gstRate,
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

    // Fallback: If subscription is missing or planId not populated, find the client's subscription
    let fallbackSub = null;
    const currentSub = client.currentSubscriptionId;
    if (!currentSub || typeof currentSub !== 'object' || !currentSub.planId) {
      try {
        const clientMongoId = client._id || client.id;
        const userMongoId = client.userId?._id || client.userId;
        const idFilter = [];
        if (currentSub && typeof currentSub !== 'object' && /^[a-fA-F0-9]{24}$/.test(String(currentSub))) {
          idFilter.push({ _id: currentSub });
        }
        if (clientMongoId && /^[a-fA-F0-9]{24}$/.test(String(clientMongoId))) {
          idFilter.push({ clientId: clientMongoId });
        }
        if (userMongoId && /^[a-fA-F0-9]{24}$/.test(String(userMongoId))) {
          idFilter.push({ clientId: userMongoId });
        }

        if (idFilter.length) {
          fallbackSub = await ClientSubscriptionModel.findOne({ $or: idFilter })
            .populate('planId')
            .sort({ createdAt: -1 })
            .exec();
        }
      } catch {
        // Safe fallback
      }
    }

    const clientObj = this.#mapClientDetail(client, fallbackSub);
    try {
      await this.redisService.set(cacheKey, clientObj, SystemConstants.CACHE_TTL.SHORT);
    } catch {
      // Safe Redis bypass
    }

    return clientObj;
  }

  #mapClientDetail(client, fallbackSub = null) {
    const raw = client.toJSON ? client.toJSON() : client;
    const user = raw.userId && typeof raw.userId === 'object' ? raw.userId : null;
    let sub =
      raw.currentSubscriptionId && typeof raw.currentSubscriptionId === 'object'
        ? raw.currentSubscriptionId
        : null;

    if (!sub && fallbackSub) {
      sub = fallbackSub.toJSON ? fallbackSub.toJSON() : fallbackSub;
    }

    const planDoc = sub?.planId && typeof sub.planId === 'object' ? sub.planId : null;
    const rawPlanId =
      planDoc?._id?.toString() ||
      planDoc?.id?.toString() ||
      (typeof sub?.planId === 'string' ? sub.planId : '') ||
      (raw.planId ? String(raw.planId) : '');

    const planGstRate = planDoc?.gstPercentage !== undefined
      ? Number(planDoc.gstPercentage)
      : (sub?.gstPercentage !== undefined ? Number(sub.gstPercentage) : 0);

    const totalPlanPrice =
      sub?.totalPlanPrice !== undefined && sub?.totalPlanPrice !== null
        ? Number(sub.totalPlanPrice)
        : (planDoc?.totalPrice !== undefined && planDoc?.totalPrice !== null
            ? Number(planDoc.totalPrice)
            : (sub?.monthlyCharge ? Math.round(sub.monthlyCharge * (sub?.durationInMonths || 1) * (1 + planGstRate / 100) * 100) / 100 : 0));
    const isSuspended = raw.status === ClientStatus.SUSPENDED || raw.status === 'Suspended';
    const isApproach = raw.status === ClientStatus.APPROACH_CLIENT || raw.status === 'Approach Client';
    const rawPaid = sub?.paidAmount !== undefined && sub?.paidAmount !== null ? Number(sub.paidAmount) : 0;
    const paidAmount = isApproach ? 0 : rawPaid;
    const calculatedRemaining = totalPlanPrice > 0
      ? Math.max(0, Math.round((totalPlanPrice - paidAmount) * 100) / 100)
      : 0;
    const remainingAmount = isApproach ? totalPlanPrice : (
      sub?.remainingAmount !== undefined && sub?.remainingAmount !== null && sub?.remainingAmount > 0
        ? Number(sub.remainingAmount)
        : calculatedRemaining
    );
    const isSubActivePaid = !isSuspended && !isApproach && sub?.status === 'ACTIVE' && remainingAmount <= 0 && paidAmount >= totalPlanPrice && totalPlanPrice > 0;

    const billingCycle = sub?.billingCycle || planDoc?.billingCycle || raw.billingCycle || raw.plan || 'MONTHLY';
    const packageTier = sub?.packageTier || planDoc?.packageTier || raw.packageTier || 'BASIC';
    const packageName = planDoc?.name || sub?.packageName || sub?.packageTier || raw.packageName || packageTier;

    return {
      id: raw.id || raw._id?.toString(),
      name: user?.name || raw.name || '',
      businessName: raw.businessName || '',
      email: raw.email || user?.email || '',
      phone: user?.phone || raw.phone || '',
      city: raw.installationAddress?.city || raw.city || '',
      address: raw.installationAddress?.address || raw.address || '',
      pincode: raw.installationAddress?.pincode || raw.pincode || '',
      state: raw.installationAddress?.state || raw.state || 'Madhya Pradesh',
      gstin: raw.gstin || '',
      cameras: raw.totalCamerasInstalled || raw.cameras?.length || sub?.cameraCount || 0,
      status: isSuspended ? ClientStatus.SUSPENDED : (isSubActivePaid ? ClientStatus.ACTIVE : (raw.status || ClientStatus.ACTIVE)),
      planId: rawPlanId,
      packageTier,
      billingCycle,
      plan: billingCycle,
      packageName,
      planName: packageName,
      durationInMonths: sub?.durationInMonths || planDoc?.durationInMonths || 1,
      totalPlanPrice,
      paidAmount,
      remainingAmount,
      monthlyCharge: sub?.monthlyCharge || planDoc?.basePrice || 0,
      planCharge: totalPlanPrice,
      renewalDate: sub?.renewalDate || null,
      nextDueDate: sub?.renewalDate || null,
      contractStart: sub?.contractStartDate || raw.createdAt || null,
      autoRenew: sub?.autoRenewal !== undefined ? sub.autoRenewal : true,
      outstanding: isSubActivePaid ? 0 : (isApproach ? totalPlanPrice : remainingAmount),
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
      if (updateData.email) userUpdates.email = String(updateData.email).trim().toLowerCase();
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
    if (updateData.email !== undefined) {
      clientUpdates.email = updateData.email ? String(updateData.email).trim().toLowerCase() : null;
    }
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

    // Update Subscription if subscription fields are supplied
    const subUpdates = {};
    if (updateData.planId) subUpdates.planId = updateData.planId;
    if (updateData.packageTier) subUpdates.packageTier = updateData.packageTier;
    if (updateData.billingCycle) subUpdates.billingCycle = updateData.billingCycle;
    if (updateData.monthlyCharge !== undefined) subUpdates.monthlyCharge = Number(updateData.monthlyCharge);
    if (updateData.renewalDate) subUpdates.renewalDate = new Date(updateData.renewalDate);
    if (updateData.contractStart) subUpdates.contractStartDate = new Date(updateData.contractStart);
    if (updateData.autoRenew !== undefined) subUpdates.autoRenewal = Boolean(updateData.autoRenew);

    if (Object.keys(subUpdates).length > 0) {
      try {
        const clientMongoId = existing._id || existing.id;
        const userMongoId = existing.userId?._id || existing.userId;
        const idFilter = [];
        if (existing.currentSubscriptionId && /^[a-fA-F0-9]{24}$/.test(String(existing.currentSubscriptionId))) {
          idFilter.push({ _id: existing.currentSubscriptionId });
        }
        if (clientMongoId && /^[a-fA-F0-9]{24}$/.test(String(clientMongoId))) {
          idFilter.push({ clientId: clientMongoId });
        }
        if (userMongoId && /^[a-fA-F0-9]{24}$/.test(String(userMongoId))) {
          idFilter.push({ clientId: userMongoId });
        }

        if (idFilter.length) {
          const updatedSub = await ClientSubscriptionModel.findOneAndUpdate(
            { $or: idFilter },
            { $set: subUpdates },
            { new: true }
          ).populate('planId');

          if (updatedSub && !existing.currentSubscriptionId) {
            clientUpdates.currentSubscriptionId = updatedSub._id;
          }
        }
      } catch {
        // Safe fallback
      }
    }

    const updatedClient = await this.clientRepository.update(id, clientUpdates);
    if (clientUpdates.status) {
      await this.#syncSubscriptionsOnClientStatusChange(updatedClient, clientUpdates.status);
    }

    const clientObj = this.#mapClientDetail(updatedClient);

    await this.redisService.del(`client:${id}`);
    await this.redisService.del('client:stats');
    await this.redisService.del('dashboard:kpis');
    await this.redisService?.del?.('sub:summary');

    return clientObj;
  }

  #normalizeStatus(status) {
    if (!status) return ClientStatus.ACTIVE;
    const s = String(status).trim().toUpperCase();
    if (s === 'ACTIVE') return ClientStatus.ACTIVE;
    if (s === 'SUSPENDED') return ClientStatus.SUSPENDED;
    if (s === 'APPROACH CLIENT' || s === 'APPROACH_CLIENT') return ClientStatus.APPROACH_CLIENT;
    if (s === 'DUE') return ClientStatus.DUE;
    if (s === 'OVERDUE') return ClientStatus.OVERDUE;
    return status;
  }

  async #syncSubscriptionsOnClientStatusChange(client, status) {
    if (!client || !status) return;

    const normalizedStatus = String(status).trim().toUpperCase();
    const isSuspended = normalizedStatus === 'SUSPENDED';
    const isActive = normalizedStatus === 'ACTIVE';

    if (!isSuspended && !isActive) return;

    const clientMongoId = client._id || client.id;
    const userMongoId = client.userId?._id || client.userId;

    const idFilter = [];
    if (clientMongoId) idFilter.push({ clientId: clientMongoId });
    if (userMongoId) idFilter.push({ clientId: userMongoId });
    if (client.currentSubscriptionId) idFilter.push({ _id: client.currentSubscriptionId });

    if (!idFilter.length) return;

    try {
      if (isSuspended) {
        // Automatically suspend all subscriptions of this client
        await ClientSubscriptionModel.updateMany(
          { $or: idFilter },
          { $set: { status: SubscriptionStatus.SUSPENDED, suspendedAt: new Date() } }
        );
        if (userMongoId && this.userRepository?.updateStatus) {
          await this.userRepository.updateStatus(userMongoId, UserStatus.SUSPENDED).catch(() => {});
        }
      } else if (isActive) {
        // If activating/reactivating client, reactivate their suspended, cancelled, or pending subscriptions
        await ClientSubscriptionModel.updateMany(
          {
            $or: idFilter,
            status: {
              $in: [
                SubscriptionStatus.SUSPENDED,
                SubscriptionStatus.CANCELLED,
                SubscriptionStatus.PENDING_PAYMENT,
                'SUSPENDED',
                'CANCELLED',
                'PENDING_PAYMENT',
              ],
            },
          },
          { $set: { status: SubscriptionStatus.ACTIVE, suspendedAt: null } }
        );
        if (userMongoId && this.userRepository?.updateStatus) {
          await this.userRepository.updateStatus(userMongoId, UserStatus.ACTIVE).catch(() => {});
        }

        // If client had attempted/failed checkouts, mark them resolved by admin so auto-reconciliation ignores them
        if (clientMongoId) {
          await CheckoutSessionModel.updateMany(
            { clientId: clientMongoId, status: { $in: ['FAILED', 'PENDING', 'EXPIRED'] } },
            { $set: { status: 'CANCELLED', resolvedByAdmin: true } }
          ).catch(() => {});
        }
      }

      await this.redisService?.del?.('sub:summary');
      if (userMongoId) {
        await this.redisService?.del?.(`sub:client:${userMongoId}`);
      }
      await this.redisService?.del?.('dashboard:kpis');
    } catch {
      // Non-blocking
    }
  }

  async updateClientStatus(id, rawStatus) {
    const status = this.#normalizeStatus(rawStatus);
    const updatedClient = await this.clientRepository.updateStatus(id, status);
    if (!updatedClient) {
      this.throwNotFound('Client');
    }

    // Persist isManuallyManaged flag to protect against automatic background reconciliation scripts
    if (this.clientRepository?.model?.updateOne) {
      await this.clientRepository.model.updateOne(
        { _id: updatedClient._id || updatedClient.id },
        { $set: { isManuallyManaged: true, status } }
      ).catch(() => {});
    }

    await this.#syncSubscriptionsOnClientStatusChange(updatedClient, status);

    const clientObj = this.#mapClientDetail(updatedClient);
    await this.redisService.del(`client:${id}`);
    await this.redisService.del('client:stats');
    await this.redisService.del('dashboard:kpis');

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

  async reconcileApproachClients() {
    try {
      const attemptedCheckouts = await CheckoutSessionModel.find({
        status: { $in: ['FAILED', 'PENDING', 'EXPIRED'] },
      }).select('clientId').lean();

      if (!attemptedCheckouts.length) return;

      const clientIds = [...new Set(attemptedCheckouts.map((co) => co.clientId?.toString()).filter(Boolean))];

      for (const cid of clientIds) {
        const hasPaidCheckout = await CheckoutSessionModel.exists({
          clientId: cid,
          status: 'PAID',
        });
        if (hasPaidCheckout) continue;

        const hasPaidPayment = await PaymentTransactionModel.exists({
          clientId: cid,
          status: 'PAID',
        });
        if (hasPaidPayment) continue;

        const client = await this.clientRepository.findById(cid);
        if (
          client &&
          !client.isManuallyManaged &&
          client.status !== ClientStatus.APPROACH_CLIENT &&
          client.status !== ClientStatus.ACTIVE &&
          client.status !== 'Active' &&
          client.status !== ClientStatus.SUSPENDED &&
          client.status !== 'Suspended'
        ) {
          await this.clientRepository.updateStatus(cid, ClientStatus.APPROACH_CLIENT);
          await this.redisService?.del?.(`client:${cid}`);
        }
      }

      // Ensure all subscriptions of suspended clients are automatically suspended
      const suspendedClients = await this.clientRepository.model.find({
        status: { $in: [ClientStatus.SUSPENDED, 'Suspended', 'SUSPENDED'] }
      }).select('_id userId currentSubscriptionId').lean();

      for (const sc of suspendedClients) {
        const scFilter = [];
        if (sc._id) scFilter.push({ clientId: sc._id });
        if (sc.userId) scFilter.push({ clientId: sc.userId });
        if (sc.currentSubscriptionId) scFilter.push({ _id: sc.currentSubscriptionId });
        if (scFilter.length) {
          await ClientSubscriptionModel.updateMany(
            { $or: scFilter, status: { $ne: SubscriptionStatus.SUSPENDED } },
            { $set: { status: SubscriptionStatus.SUSPENDED, suspendedAt: new Date() } }
          );
        }
      }
    } catch {
      // Non-blocking auto reconciliation
    }
  }

  async getClientStats() {
    const cacheKey = 'client:stats';
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return { ...cached, _cached: true };
    }

    await this.reconcileApproachClients();
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

    let clientObj = this.#mapClientDetail(client);
    const clientMongoId = client._id || client.id;
    const userMongoId = client.userId?._id || client.userId;

    const idFilter = [];
    if (clientMongoId) idFilter.push({ clientId: clientMongoId });
    if (userMongoId) idFilter.push({ clientId: userMongoId });

    const isClientSuspended = clientObj.status === ClientStatus.SUSPENDED || clientObj.status === 'Suspended' || client.status === ClientStatus.SUSPENDED || client.status === 'Suspended';
    const isClientActive = (clientObj.status === ClientStatus.ACTIVE || clientObj.status === 'Active' || client.status === ClientStatus.ACTIVE || client.status === 'Active') && !isClientSuspended;
    const isSubApproach = clientObj.status === 'Approach Client' || client.status === 'Approach Client' || clientObj.status === ClientStatus.APPROACH_CLIENT || client.status === ClientStatus.APPROACH_CLIENT;

    if (isClientSuspended && idFilter.length) {
      ClientSubscriptionModel.updateMany(
        { $or: idFilter, status: { $ne: SubscriptionStatus.SUSPENDED } },
        { $set: { status: SubscriptionStatus.SUSPENDED, suspendedAt: new Date() } }
      ).catch(() => {});
    } else if (isClientActive && idFilter.length) {
      ClientSubscriptionModel.updateMany(
        {
          $or: idFilter,
          status: {
            $in: [
              SubscriptionStatus.SUSPENDED,
              SubscriptionStatus.CANCELLED,
              SubscriptionStatus.PENDING_PAYMENT,
              'SUSPENDED',
              'CANCELLED',
              'PENDING_PAYMENT',
            ],
          },
        },
        { $set: { status: SubscriptionStatus.ACTIVE, suspendedAt: null } }
      ).catch(() => {});
    }

    // Fetch Invoices, Payments, Reminders, and Subscriptions concurrently
    const [rawInvoices, rawPayments, rawReminders, rawSubscriptions] = await Promise.all([
      InvoiceModel.find({ $or: idFilter }).sort({ createdAt: -1 }).lean().exec(),
      PaymentTransactionModel.find({ $or: idFilter }).sort({ paidAt: -1, createdAt: -1 }).lean().exec(),
      ReminderRuleModel.find({ $or: idFilter }).sort({ createdAt: -1 }).lean().exec(),
      ClientSubscriptionModel.find({ $or: idFilter }).populate('planId').sort({ createdAt: -1 }).lean().exec(),
    ]);

    // Map Subscriptions
    const subscriptions = rawSubscriptions.map((sub) => {
      const planDoc = sub.planId || {};
      const durationInMonths = sub.durationInMonths || planDoc.durationInMonths || 1;
      const planGstRate = planDoc.gstPercentage !== undefined
        ? Number(planDoc.gstPercentage)
        : (sub.gstPercentage !== undefined ? Number(sub.gstPercentage) : 0);
      const subPrice = Number(sub.totalPlanPrice || planDoc.totalPrice || (sub.monthlyCharge ? Math.round(sub.monthlyCharge * durationInMonths * (1 + planGstRate / 100) * 100) / 100 : 0));

      const subPaymentsPaid = rawPayments
        .filter((p) => String(p.subscriptionId) === String(sub._id) && p.status === 'PAID')
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const paidAmount = isSubApproach ? 0 : (subPaymentsPaid > 0 ? subPaymentsPaid : Number(sub.paidAmount || 0));
      const remainingAmount = isSubApproach ? subPrice : Math.max(0, Math.round((subPrice - paidAmount) * 100) / 100);

      return {
        id: String(sub._id),
        plan: sub.billingCycle || planDoc.billingCycle || clientObj.plan || 'MONTHLY',
        planName: planDoc.name || sub.packageTier || clientObj.packageName || 'CCTV Plan',
        packageName: planDoc.name || sub.packageTier || clientObj.packageName || 'CCTV Plan',
        packageTier: sub.packageTier,
        durationInMonths,
        totalPlanPrice: subPrice,
        paidAmount,
        remainingAmount,
        installationCharge: Number(sub.installationCharge || 0),
        installationGst: Number(sub.installationGst || 0),
        installationHsnSac: sub.installationHsnSac || '995469',
        status: isClientSuspended
          ? SubscriptionStatus.SUSPENDED
          : (isClientActive && (sub.status === SubscriptionStatus.SUSPENDED || sub.status === SubscriptionStatus.CANCELLED || sub.status === SubscriptionStatus.PENDING_PAYMENT) ? SubscriptionStatus.ACTIVE : (sub.status || 'ACTIVE')),
        startDate: sub.contractStartDate || sub.createdAt,
        renewalDate: sub.renewalDate,
        amount: Number(paidAmount),
        monthlyCharge: Number(sub.monthlyCharge || 0),
        createdAt: sub.createdAt,
      };
    });

    const activeSub = subscriptions.find((s) => s.status === 'ACTIVE' || s.status === 'Active') || subscriptions[0];
    const isFullyPaidActive = !isClientSuspended && activeSub && (activeSub.status === 'ACTIVE' || activeSub.status === 'Active') && activeSub.remainingAmount <= 0 && activeSub.paidAmount >= activeSub.totalPlanPrice && activeSub.totalPlanPrice > 0;

    // Auto-sync client status in DB to 'Active' if subscription is active & fully paid
    if (!isClientSuspended && !isSubApproach && isFullyPaidActive && (client.status === 'Due' || client.status === 'DUE')) {
      clientObj.status = ClientStatus.ACTIVE;
      this.clientRepository.updateStatus(client._id || client.id, ClientStatus.ACTIVE).catch(() => {});
      try {
        this.redisService.del(`client:${client._id || client.id}`);
        this.redisService.del('client:stats');
      } catch {
        // Safe redis
      }
    }

    // Map Invoices
    const invoices = rawInvoices.map((inv) => {
      const total = Number(inv.totalAmount || inv.total || 0);
      const paid = Number(inv.amountPaid || (isFullyPaidActive ? total : 0));
      const balance = isFullyPaidActive ? 0 : (inv.amountDue !== undefined ? Number(inv.amountDue) : Math.max(0, total - paid));
      return {
        id: inv.invoiceNumber || String(inv._id),
        _id: String(inv._id),
        invoiceNumber: inv.invoiceNumber,
        invoiceType: inv.invoiceType || 'NEW_PLAN',
        issueDate: inv.issueDate || inv.createdAt,
        dueDate: inv.dueDate || inv.createdAt,
        status: isFullyPaidActive ? 'PAID' : (inv.status || 'UNPAID'),
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

    // Build Activity Timeline
    const activity = [];
    if (client.createdAt) {
      activity.push({
        id: `act-onboarded-${client._id}`,
        type: 'Client',
        title: `Client account "${client.businessName}" created`,
        at: client.createdAt,
        meta: `Status: ${clientObj.status}`,
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

    const totalPaidFromPayments = payments
      .filter((p) => p.status === 'PAID')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const isApproach = clientObj.status === 'Approach Client' || client.status === 'Approach Client';

    const totalPaid = isApproach
      ? 0
      : Math.round(Number(totalPaidFromPayments > 0 ? totalPaidFromPayments : (isFullyPaidActive ? (activeSub?.totalPlanPrice || 0) : (activeSub?.paidAmount || 0))) * 100) / 100;

    const invoiceOutstandingTotal = invoices
      .filter((inv) => ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE'].includes(inv.status))
      .reduce((sum, inv) => sum + Number(inv.balance || 0), 0);

    const totalPlanCharge = Number(activeSub?.totalPlanPrice || clientObj.totalPlanPrice || clientObj.planCharge || 0);

    let calculatedOutstanding = 0;
    if (isApproach) {
      calculatedOutstanding = totalPlanCharge;
    } else if (isFullyPaidActive || (totalPlanCharge > 0 && totalPaid >= totalPlanCharge)) {
      calculatedOutstanding = 0;
    } else {
      calculatedOutstanding = Math.max(0, Math.round((totalPlanCharge - totalPaid) * 100) / 100);
    }

    if (invoiceOutstandingTotal > calculatedOutstanding) {
      calculatedOutstanding = invoiceOutstandingTotal;
    }

    const outstanding = Math.round(Number(calculatedOutstanding) * 100) / 100;

    const paymentSuccessRate = payments.length
      ? Math.round((payments.filter((p) => p.status === 'PAID').length / payments.length) * 100)
      : 100;

    const paymentTimeline = payments.length
      ? payments.map((p) => ({ date: p.paidAt, amount: p.amount }))
      : [];

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
        paidAmount: totalPaid,
        remainingAmount: outstanding,
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
