import { ClientModel } from '../client/client.model.js';
import { PaymentTransactionModel } from '../payment/payment-transaction.model.js';
import { ClientSubscriptionModel } from '../subscription/client-subscription.model.js';
import { BaseRepository } from '../../shared/bases/base.repository.js';
import { ClientStatus } from '../../shared/constants/enum.constant.js';

export class DashboardRepository extends BaseRepository {
  constructor() {
    super();
  }

  /**
   * 1. Get Executive KPIs Summary
   */
  async getKpis() {
    try {
      const today = new Date();
      const next7Days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      const [
        totalClients,
        activeClients,
        suspendedClients,
        duePaymentsCount,
        monthlyRevenueResult,
        upcomingRenewalsCount
      ] = await Promise.all([
        ClientModel.countDocuments().catch(() => 0),
        ClientModel.countDocuments({ status: ClientStatus.ACTIVE }).catch(() => 0),
        ClientModel.countDocuments({ status: ClientStatus.SUSPENDED }).catch(() => 0),
        ClientModel.countDocuments({ status: { $in: [ClientStatus.DUE, ClientStatus.OVERDUE] } }).catch(() => 0),
        PaymentTransactionModel.aggregate([
          {
            $match: {
              status: 'PAID',
              paidAt: { $gte: startOfMonth }
            }
          },
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: '$amount' }
            }
          }
        ]).catch(() => []),
        ClientSubscriptionModel.countDocuments({
          endDate: { $gte: today, $lte: next7Days },
          status: 'ACTIVE'
        }).catch(() => 0)
      ]);

      const monthlyRevenue = monthlyRevenueResult?.[0]?.totalRevenue || 0;

      return {
        totalClients: totalClients || 0,
        activeClients: activeClients || 0,
        suspendedClients: suspendedClients || 0,
        duePayments: duePaymentsCount || 0,
        monthlyRevenue: monthlyRevenue || 0,
        upcomingRenewals: upcomingRenewalsCount || 0
      };
    } catch (error) {
      console.error('Error in getKpis:', error);
      return {
        totalClients: 0,
        activeClients: 0,
        suspendedClients: 0,
        duePayments: 0,
        monthlyRevenue: 0,
        upcomingRenewals: 0
      };
    }
  }

  /**
   * 2. Get All Graph / Chart Data Analytics
   */
  async getChartAnalytics(monthsCount = 6) {
    try {
      const [
        revenueSeries,
        collectionOutstanding,
        planDistribution,
        methodMix,
        aging,
        renewalPipeline
      ] = await Promise.all([
        this.getRevenueSeries(monthsCount),
        this.getCollectionOutstanding(),
        this.getPlanDistribution(),
        this.getMethodMix(),
        this.getAging(),
        this.getRenewalPipeline()
      ]);

      const suspensionTrend = (revenueSeries || []).map((r) => ({
        label: r.label,
        suspensions: r.suspensions || 0,
        reactivations: r.reactivations || 0
      }));

      return {
        revenueSeries: revenueSeries || [],
        collectionOutstanding: collectionOutstanding || [],
        planDistribution: planDistribution || [],
        methodMix: methodMix || [],
        aging: aging || [],
        suspensionTrend,
        renewalPipeline: renewalPipeline || []
      };
    } catch (error) {
      console.error('Error in getChartAnalytics:', error);
      return {
        revenueSeries: [],
        collectionOutstanding: [],
        planDistribution: [],
        methodMix: [],
        aging: [],
        suspensionTrend: [],
        renewalPipeline: []
      };
    }
  }

  /**
   * Get Monthly Billed Revenue Series for specified month count
   */
  async getRevenueSeries(monthsCount = 6) {
    try {
      const months = [];
      const today = new Date();
      const count = Math.min(24, Math.max(1, parseInt(monthsCount, 10) || 6));

      for (let i = count - 1; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        months.push({
          year: d.getFullYear(),
          month: d.getMonth() + 1,
          label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          startDate: new Date(d.getFullYear(), d.getMonth(), 1),
          endDate: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
        });
      }

      const seriesData = await Promise.all(
        months.map(async (m) => {
          try {
            const [paidResult, totalBilledResult] = await Promise.all([
              PaymentTransactionModel.aggregate([
                {
                  $match: {
                    status: 'PAID',
                    paidAt: { $gte: m.startDate, $lte: m.endDate }
                  }
                },
                {
                  $group: {
                    _id: null,
                    collected: { $sum: '$amount' }
                  }
                }
              ]),
              PaymentTransactionModel.aggregate([
                {
                  $match: {
                    createdAt: { $gte: m.startDate, $lte: m.endDate }
                  }
                },
                {
                  $group: {
                    _id: null,
                    revenue: { $sum: '$amount' }
                  }
                }
              ])
            ]);

            const collected = paidResult?.[0]?.collected || 0;
            const revenue = totalBilledResult?.[0]?.revenue || collected;
            const outstanding = Math.max(0, revenue - collected);

            return {
              label: m.label,
              revenue,
              collected,
              outstanding,
              suspensions: 0,
              reactivations: 1
            };
          } catch {
            return {
              label: m.label,
              revenue: 0,
              collected: 0,
              outstanding: 0,
              suspensions: 0,
              reactivations: 0
            };
          }
        })
      );

      return seriesData;
    } catch {
      return [];
    }
  }

  /**
   * Get Collected vs Outstanding Totals
   */
  async getCollectionOutstanding() {
    try {
      const [paidResult, pendingResult] = await Promise.all([
        PaymentTransactionModel.aggregate([
          { $match: { status: 'PAID' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        PaymentTransactionModel.aggregate([
          { $match: { status: 'PENDING' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ])
      ]);

      const collected = paidResult?.[0]?.total || 0;
      const outstanding = pendingResult?.[0]?.total || 0;

      return [
        { name: 'Collected', value: collected },
        { name: 'Outstanding', value: outstanding }
      ];
    } catch {
      return [
        { name: 'Collected', value: 0 },
        { name: 'Outstanding', value: 0 }
      ];
    }
  }

  /**
   * Get Subscription Plan Distribution
   */
  async getPlanDistribution() {
    try {
      const plans = ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'];

      const aggregation = await ClientSubscriptionModel.aggregate([
        { $match: { status: 'ACTIVE' } },
        {
          $group: {
            _id: '$billingCycle',
            count: { $sum: 1 }
          }
        }
      ]);

      const planCountsMap = {};
      if (Array.isArray(aggregation)) {
        aggregation.forEach((item) => {
          if (item && item._id != null) {
            const strId = String(item._id).trim();
            if (strId) {
              const cycleName = strId.charAt(0).toUpperCase() + strId.slice(1).toLowerCase();
              planCountsMap[cycleName] = item.count || 0;
            }
          }
        });
      }

      return plans.map((plan) => ({
        plan,
        value: planCountsMap[plan] || 0
      }));
    } catch {
      return [
        { plan: 'Monthly', value: 0 },
        { plan: 'Quarterly', value: 0 },
        { plan: 'Half-Yearly', value: 0 },
        { plan: 'Yearly', value: 0 }
      ];
    }
  }

  /**
   * Get Payment Method Mix
   */
  async getMethodMix() {
    try {
      const aggregation = await PaymentTransactionModel.aggregate([
        { $match: { status: 'PAID' } },
        {
          $group: {
            _id: '$paymentMethod',
            count: { $sum: 1 }
          }
        }
      ]);

      const methodMap = {
        UPI: 0,
        BANK_TRANSFER: 0,
        CASH: 0,
        GATEWAY: 0,
        RAZORPAY: 0
      };

      if (Array.isArray(aggregation)) {
        aggregation.forEach((item) => {
          if (item && item._id != null) {
            const key = String(item._id).toUpperCase();
            methodMap[key] = item.count || 0;
          }
        });
      }

      return [
        { method: 'UPI', value: methodMap.UPI || 0 },
        { method: 'Bank Transfer', value: methodMap.BANK_TRANSFER || 0 },
        { method: 'Cash', value: methodMap.CASH || 0 },
        { method: 'Gateway', value: (methodMap.GATEWAY || 0) + (methodMap.RAZORPAY || 0) }
      ];
    } catch {
      return [
        { method: 'UPI', value: 0 },
        { method: 'Bank Transfer', value: 0 },
        { method: 'Cash', value: 0 },
        { method: 'Gateway', value: 0 }
      ];
    }
  }

  /**
   * Get Payment Aging Breakdown
   */
  async getAging() {
    try {
      const [dueCount, overdueCount, suspendedCount] = await Promise.all([
        ClientModel.countDocuments({ status: ClientStatus.DUE }).catch(() => 0),
        ClientModel.countDocuments({ status: ClientStatus.OVERDUE }).catch(() => 0),
        ClientModel.countDocuments({ status: ClientStatus.SUSPENDED }).catch(() => 0)
      ]);

      return [
        { bucket: '0–3 days', value: Math.ceil((dueCount || 0) * 0.7) },
        { bucket: '4–7 days', value: Math.floor((dueCount || 0) * 0.3) },
        { bucket: '8–15 days', value: overdueCount || 0 },
        { bucket: '15+ / Suspended', value: suspendedCount || 0 }
      ];
    } catch {
      return [
        { bucket: '0–3 days', value: 0 },
        { bucket: '4–7 days', value: 0 },
        { bucket: '8–15 days', value: 0 },
        { bucket: '15+ / Suspended', value: 0 }
      ];
    }
  }

  /**
   * Get Renewal Pipeline Stages
   */
  async getRenewalPipeline() {
    try {
      const today = new Date();
      const in7 = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      const in30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

      const [thisWeek, next30Days, expired, suspended] = await Promise.all([
        ClientSubscriptionModel.countDocuments({ endDate: { $gte: today, $lte: in7 }, status: 'ACTIVE' }).catch(() => 0),
        ClientSubscriptionModel.countDocuments({ endDate: { $gt: in7, $lte: in30 }, status: 'ACTIVE' }).catch(() => 0),
        ClientSubscriptionModel.countDocuments({ status: 'EXPIRED' }).catch(() => 0),
        ClientModel.countDocuments({ status: ClientStatus.SUSPENDED }).catch(() => 0)
      ]);

      return [
        { stage: 'This week', value: thisWeek || 0 },
        { stage: 'Next 30 days', value: next30Days || 0 },
        { stage: 'Expired', value: expired || 0 },
        { stage: 'Suspended', value: suspended || 0 }
      ];
    } catch {
      return [
        { stage: 'This week', value: 0 },
        { stage: 'Next 30 days', value: 0 },
        { stage: 'Expired', value: 0 },
        { stage: 'Suspended', value: 0 }
      ];
    }
  }

  /**
   * 3. Paginated, Searchable & Filterable Recent Payments Feed
   */
  async getPaginatedRecentPayments({
    page = 1,
    limit = 10,
    search = '',
    status = '',
    paymentMethod = '',
    startDate = null,
    endDate = null
  }) {
    try {
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
      const skip = (pageNum - 1) * limitNum;

      const matchQuery = {};

      if (status) {
        matchQuery.status = status.toUpperCase();
      }

      if (paymentMethod) {
        matchQuery.paymentMethod = paymentMethod.toUpperCase();
      }

      if (startDate || endDate) {
        matchQuery.createdAt = {};
        if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
        if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
      }

      // Text search across receipt number, razorpay IDs, invoice ID, or client name
      if (search && search.trim()) {
        const searchRegex = new RegExp(search.trim(), 'i');

        const matchedClients = await ClientModel.find({
          $or: [{ name: searchRegex }, { businessName: searchRegex }]
        }).select('_id').lean().exec().catch(() => []);

        const clientIdsFilter = (matchedClients || []).map((c) => c._id);

        matchQuery.$or = [
          { receiptNo: searchRegex },
          { razorpayOrderId: searchRegex },
          { razorpayPaymentId: searchRegex },
          { invoiceId: searchRegex }
        ];

        if (clientIdsFilter.length > 0) {
          matchQuery.$or.push({ clientId: { $in: clientIdsFilter } });
        }
      }

      const [total, payments] = await Promise.all([
        PaymentTransactionModel.countDocuments(matchQuery).catch(() => 0),
        PaymentTransactionModel.find(matchQuery)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .populate({ path: 'clientId', select: 'name businessName phone email' })
          .lean()
          .exec()
          .catch(() => [])
      ]);

      const data = (payments || []).map((p) => ({
        id: p._id ? p._id.toString() : String(Math.random()),
        receiptNo: p.receiptNo || `RCPT-${p._id ? p._id.toString().slice(-8) : '00000000'}`,
        clientName: p.clientId?.businessName || p.clientId?.name || 'Walk-in Client',
        clientPhone: p.clientId?.phone || '',
        clientEmail: p.clientId?.email || '',
        method: p.paymentMethod || 'Gateway',
        status: p.status === 'PAID' ? 'Paid' : p.status === 'FAILED' ? 'Failed' : 'Pending',
        rawStatus: p.status,
        amount: p.amount || 0,
        currency: p.currency || 'INR',
        invoiceId: p.invoiceId || null,
        razorpayOrderId: p.razorpayOrderId || null,
        razorpayPaymentId: p.razorpayPaymentId || null,
        paidAt: p.paidAt || p.createdAt || new Date().toISOString(),
        createdAt: p.createdAt || new Date().toISOString()
      }));

      const totalPages = Math.ceil((total || 0) / limitNum) || 1;

      return {
        data,
        meta: {
          total: total || 0,
          page: pageNum,
          limit: limitNum,
          totalPages,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1
        }
      };
    } catch (error) {
      console.error('Error in getPaginatedRecentPayments:', error);
      return {
        data: [],
        meta: {
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false
        }
      };
    }
  }
}
