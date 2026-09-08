import { BaseRepository } from '../../shared/bases/base.repository.js';
import { SubscriptionPlanModel } from './plan.model.js';
import { ClientSubscriptionModel } from './client-subscription.model.js';

export class SubscriptionRepository extends BaseRepository {
  constructor() {
    super();
    this.planModel = SubscriptionPlanModel;
    this.clientSubscriptionModel = ClientSubscriptionModel;
  }

  // --- Plan Operations ---

  async findPlanById(id) {
    return this.planModel.findById(id).exec();
  }

  async findPlanByCode(planCode) {
    return this.planModel.findOne({ planCode: planCode.toUpperCase() }).exec();
  }

  async createPlan(planData) {
    const plan = new this.planModel(planData);
    return plan.save();
  }

  async updatePlan(id, updateData) {
    return this.planModel.findByIdAndUpdate(id, { $set: updateData }, { new: true, runValidators: true }).exec();
  }

  async deletePlan(id) {
    return this.planModel.findByIdAndDelete(id).exec();
  }

  /**
   * MongoDB Aggregation Pipeline for paginated plans search
   */
  async findPaginatedPlansWithAggregation({
    skip = 0,
    limit = 10,
    search = '',
    packageTier = null,
    billingCycle = null,
    status = null,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  }) {
    const matchConditions = {};

    if (search) {
      matchConditions.$or = [
        { name: { $regex: search, $options: 'i' } },
        { planCode: { $regex: search, $options: 'i' } }
      ];
    }

    if (packageTier) {
      matchConditions.packageTier = packageTier;
    }

    if (billingCycle) {
      matchConditions.billingCycle = billingCycle;
    }

    if (status) {
      matchConditions.status = status;
    }

    const sortDirection = sortOrder === 'asc' ? 1 : -1;

    const pipeline = [
      { $match: matchConditions },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [
            { $sort: { [sortBy]: sortDirection } },
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                id: '$_id',
                name: 1,
                planCode: 1,
                packageTier: 1,
                billingCycle: 1,
                durationInMonths: 1,
                basePrice: 1,
                gstPercentage: 1,
                totalPrice: 1,
                maxCameras: 1,
                features: 1,
                autoRenewalSupported: 1,
                status: 1,
                createdAt: 1,
                updatedAt: 1,
                _id: 0
              }
            }
          ]
        }
      }
    ];

    const [result] = await this.planModel.aggregate(pipeline);
    const total = result.metadata[0]?.total || 0;
    const items = result.data || [];

    return { items, total };
  }

  /**
   * Aggregate statistics for Subscription Plans
   */
  async getPlanStats() {
    const pipeline = [
      {
        $facet: {
          total: [{ $count: 'count' }],
          active: [{ $match: { status: 'ACTIVE' } }, { $count: 'count' }],
          basic: [{ $match: { packageTier: 'BASIC' } }, { $count: 'count' }],
          standard: [{ $match: { packageTier: 'STANDARD' } }, { $count: 'count' }],
          premium: [{ $match: { packageTier: 'PREMIUM' } }, { $count: 'count' }],
          enterprise: [{ $match: { packageTier: 'ENTERPRISE' } }, { $count: 'count' }]
        }
      }
    ];

    const [result] = await this.planModel.aggregate(pipeline);

    return {
      totalPlans: result?.total[0]?.count || 0,
      activePlans: result?.active[0]?.count || 0,
      byTier: {
        BASIC: result?.basic[0]?.count || 0,
        STANDARD: result?.standard[0]?.count || 0,
        PREMIUM: result?.premium[0]?.count || 0,
        ENTERPRISE: result?.enterprise[0]?.count || 0
      }
    };
  }

  // --- Client Active Subscription Operations ---

  async findSubscriptionById(id) {
    return this.clientSubscriptionModel.findById(id).populate('clientId', 'name phone email').populate('planId').exec();
  }

  async findActiveSubscriptionByClient(clientId) {
    return this.clientSubscriptionModel
      .findOne({ clientId, status: { $in: ['ACTIVE', 'DUE'] } })
      .populate('planId')
      .exec();
  }

  async findSubscriptionsByClientUserId(userId) {
    return this.clientSubscriptionModel
      .find({ clientId: userId })
      .populate('planId')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findPlanByTierAndCycle(packageTier, billingCycle) {
    return this.planModel
      .findOne({
        packageTier,
        billingCycle,
        status: 'ACTIVE',
      })
      .exec();
  }

  async findActivePlanByTier(packageTier) {
    return this.planModel
      .findOne({
        packageTier,
        status: 'ACTIVE',
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  async createSubscription(subscriptionData, options = {}) {
    const subscription = new this.clientSubscriptionModel(subscriptionData);
    return subscription.save(options);
  }

  async updateSubscription(id, updateData, options = {}) {
    return this.clientSubscriptionModel
      .findByIdAndUpdate(id, { $set: updateData }, {
        new: true,
        runValidators: true,
        session: options.session,
      })
      .populate('clientId', 'name phone email')
      .populate('planId')
      .exec();
  }

  /**
   * MongoDB Aggregation Pipeline for client subscriptions with populated Client & Plan details
   */
  async findPaginatedClientSubscriptionsWithAggregation({
    skip = 0,
    limit = 10,
    search = '',
    packageTier = null,
    billingCycle = null,
    status = null,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  }) {
    const matchConditions = {};

    if (packageTier && packageTier !== 'all') {
      matchConditions.packageTier = packageTier;
    }

    if (status && status !== 'all') {
      matchConditions.status = status;
    }

    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const safeSortBy = ['createdAt', 'renewalDate', 'monthlyCharge', 'status'].includes(sortBy)
      ? sortBy
      : 'createdAt';
    const safeSkip = Math.max(0, Number(skip) || 0);
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 10));

    const pipeline = [
      { $match: matchConditions },
      {
        $lookup: {
          from: 'users',
          localField: 'clientId',
          foreignField: '_id',
          as: 'client'
        }
      },
      { $unwind: { path: '$client', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'clients',
          localField: 'clientId',
          foreignField: 'userId',
          as: 'clientProfile'
        }
      },
      { $unwind: { path: '$clientProfile', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'subscriptionplans',
          localField: 'planId',
          foreignField: '_id',
          as: 'plan'
        }
      },
      { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } }
    ];

    if (billingCycle && billingCycle !== 'all') {
      pipeline.push({ $match: { 'plan.billingCycle': billingCycle } });
    }

    if (search) {
      const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pipeline.push({
        $match: {
          $or: [
            { 'client.name': { $regex: escaped, $options: 'i' } },
            { 'client.phone': { $regex: escaped, $options: 'i' } },
            { 'client.email': { $regex: escaped, $options: 'i' } },
            { 'plan.name': { $regex: escaped, $options: 'i' } },
            { 'clientProfile.businessName': { $regex: escaped, $options: 'i' } }
          ]
        }
      });
    }

    pipeline.push({
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [
          { $sort: { [safeSortBy]: sortDirection } },
          { $skip: safeSkip },
          { $limit: safeLimit },
          {
            $project: {
              id: { $convert: { input: '$_id', to: 'string', onError: '', onNull: '' } },
              clientId: {
                $convert: { input: '$client._id', to: 'string', onError: null, onNull: null }
              },
              clientProfileId: {
                $convert: {
                  input: '$clientProfile._id',
                  to: 'string',
                  onError: null,
                  onNull: null
                }
              },
              clientName: { $ifNull: ['$client.name', 'Contact Person'] },
              clientPhone: '$client.phone',
              clientEmail: '$client.email',
              businessName: '$clientProfile.businessName',
              planId: {
                $convert: { input: '$plan._id', to: 'string', onError: null, onNull: null }
              },
              planName: { $ifNull: ['$plan.name', '$packageTier'] },
              billingCycle: '$plan.billingCycle',
              packageTier: 1,
              cameraCount: 1,
              monthlyCharge: { $ifNull: ['$monthlyCharge', 0] },
              totalPlanPrice: { $ifNull: ['$totalPlanPrice', '$plan.totalPrice', '$monthlyCharge'] },
              paidAmount: { $ifNull: ['$paidAmount', 0] },
              remainingAmount: { $ifNull: ['$remainingAmount', 0] },
              durationInMonths: { $ifNull: ['$durationInMonths', '$plan.durationInMonths', 1] },
              contractStartDate: 1,
              renewalDate: 1,
              autoRenewal: 1,
              status: 1,
              lastPaymentDate: 1,
              suspendedAt: 1,
              createdAt: 1,
              updatedAt: 1,
              _id: 0
            }
          }
        ]
      }
    });

    const [result] = await this.clientSubscriptionModel.aggregate(pipeline).allowDiskUse(true);
    const total = result?.metadata?.[0]?.total || 0;
    const items = result?.data || [];

    return { items, total };
  }

  /**
   * KPI summary for Admin Subscriptions dashboard cards
   */
  async getClientSubscriptionSummary(status = null) {
    const pipeline = [
      {
        $lookup: {
          from: 'subscriptionplans',
          localField: 'planId',
          foreignField: '_id',
          as: 'plan'
        }
      },
      { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } },
      {
        $facet: {
          active: [{ $match: { status: 'ACTIVE' } }, { $count: 'count' }],
          due: [{ $match: { status: 'DUE' } }, { $count: 'count' }],
          expired: [{ $match: { status: 'EXPIRED' } }, { $count: 'count' }],
          suspended: [{ $match: { status: 'SUSPENDED' } }, { $count: 'count' }],
          cancelled: [{ $match: { status: 'CANCELLED' } }, { $count: 'count' }],
          autoRenewOn: [{ $match: { autoRenewal: true } }, { $count: 'count' }],
          byStatusAndCycle: [
            {
              $group: {
                _id: {
                  status: '$status',
                  billingCycle: { $ifNull: ['$plan.billingCycle', 'MONTHLY'] }
                },
                count: { $sum: 1 }
              }
            }
          ],
          byBillingCycleAll: [
            {
              $group: {
                _id: { $ifNull: ['$plan.billingCycle', 'MONTHLY'] },
                count: { $sum: 1 }
              }
            }
          ]
        }
      }
    ];

    const [result] = await this.clientSubscriptionModel.aggregate(pipeline);

    const cycleLabel = {
      MONTHLY: 'Monthly',
      QUARTERLY: 'Quarterly',
      HALF_YEARLY: 'Half-Yearly',
      YEARLY: 'Yearly'
    };

    const byStatusAndPlan = {
      ACTIVE: { Monthly: 0, Quarterly: 0, 'Half-Yearly': 0, Yearly: 0 },
      DUE: { Monthly: 0, Quarterly: 0, 'Half-Yearly': 0, Yearly: 0 },
      EXPIRED: { Monthly: 0, Quarterly: 0, 'Half-Yearly': 0, Yearly: 0 },
      SUSPENDED: { Monthly: 0, Quarterly: 0, 'Half-Yearly': 0, Yearly: 0 },
      CANCELLED: { Monthly: 0, Quarterly: 0, 'Half-Yearly': 0, Yearly: 0 },
      ALL: { Monthly: 0, Quarterly: 0, 'Half-Yearly': 0, Yearly: 0 }
    };

    (result?.byBillingCycleAll || []).forEach((row) => {
      const label = cycleLabel[row._id] || 'Monthly';
      byStatusAndPlan.ALL[label] = row.count;
    });

    (result?.byStatusAndCycle || []).forEach((row) => {
      const st = String(row._id?.status || 'ACTIVE').toUpperCase();
      const label = cycleLabel[row._id?.billingCycle] || 'Monthly';
      if (!byStatusAndPlan[st]) {
        byStatusAndPlan[st] = { Monthly: 0, Quarterly: 0, 'Half-Yearly': 0, Yearly: 0 };
      }
      byStatusAndPlan[st][label] = row.count;
    });

    const targetStatus = status ? String(status).toUpperCase() : null;
    const selectedPlanCounts = (targetStatus && targetStatus !== 'ALL' && byStatusAndPlan[targetStatus])
      ? byStatusAndPlan[targetStatus]
      : byStatusAndPlan.ALL;

    return {
      active: result?.active?.[0]?.count || 0,
      due: result?.due?.[0]?.count || 0,
      expired: result?.expired?.[0]?.count || 0,
      suspended: result?.suspended?.[0]?.count || 0,
      cancelled: result?.cancelled?.[0]?.count || 0,
      autoRenewOn: result?.autoRenewOn?.[0]?.count || 0,
      currentStatus: status || 'all',
      byPlan: ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'].map((plan) => ({
        plan,
        count: selectedPlanCounts[plan] || 0
      })),
      byStatusAndPlan
    };
  }
}
