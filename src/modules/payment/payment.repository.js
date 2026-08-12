import mongoose from 'mongoose';
import { BaseRepository } from '../../shared/bases/base.repository.js';
import { PaymentTransactionModel } from './payment-transaction.model.js';

export class PaymentRepository extends BaseRepository {
  constructor() {
    super();
    this.model = PaymentTransactionModel;
  }

  async create(paymentData, options = {}) {
    const payment = new this.model(paymentData);
    return payment.save(options);
  }

  async findById(id, options = {}) {
    if (!id || typeof id !== 'string' || id.length !== 24) return null;
    const query = this.model.findById(id);
    if (options.session) query.session(options.session);
    return query.exec();
  }

  async findByReceiptNo(receiptNo, options = {}) {
    const query = this.model.findOne({ receiptNo: String(receiptNo).toUpperCase() });
    if (options.session) query.session(options.session);
    return query.exec();
  }

  async update(id, updateData, options = {}) {
    return this.model
      .findByIdAndUpdate(id, { $set: updateData }, {
        new: true,
        runValidators: true,
        session: options.session,
      })
      .exec();
  }

  async findByRazorpayOrderId(orderId, options = {}) {
    const query = this.model.findOne({ razorpayOrderId: orderId });
    if (options.session) query.session(options.session);
    return query.exec();
  }

  async findPaginatedPaymentsWithAggregation({
    skip = 0,
    limit = 10,
    search = '',
    method = null,
    status = null,
    clientId = null,
    from = null,
    to = null,
    sortBy = 'paidAt',
    sortOrder = 'desc',
  }) {
    const matchConditions = {};

    if (method && method !== 'all') matchConditions.method = method;
    if (status && status !== 'all') matchConditions.status = status;
    if (clientId && mongoose.Types.ObjectId.isValid(clientId)) {
      matchConditions.clientId = new mongoose.Types.ObjectId(clientId);
    }
    if (from || to) {
      matchConditions.paidAt = {};
      if (from) matchConditions.paidAt.$gte = new Date(from);
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        matchConditions.paidAt.$lte = end;
      }
    }

    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const safeSortBy = ['paidAt', 'amount', 'createdAt', 'status'].includes(sortBy)
      ? sortBy
      : 'paidAt';
    const safeSkip = Math.max(0, Number(skip) || 0);
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 10));

    const pipeline = [
      { $match: matchConditions },
      {
        $lookup: {
          from: 'clients',
          localField: 'clientId',
          foreignField: '_id',
          as: 'client',
        },
      },
      { $unwind: { path: '$client', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'users',
          localField: 'client.userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    ];

    if (search) {
      const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pipeline.push({
        $match: {
          $or: [
            { receiptNo: { $regex: escaped, $options: 'i' } },
            { invoiceId: { $regex: escaped, $options: 'i' } },
            { note: { $regex: escaped, $options: 'i' } },
            { 'client.businessName': { $regex: escaped, $options: 'i' } },
            { 'user.name': { $regex: escaped, $options: 'i' } },
            { 'user.phone': { $regex: escaped, $options: 'i' } },
          ],
        },
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
                $convert: { input: '$clientId', to: 'string', onError: null, onNull: null },
              },
              subscriptionId: {
                $convert: {
                  input: '$subscriptionId',
                  to: 'string',
                  onError: null,
                  onNull: null,
                },
              },
              invoiceId: 1,
              amount: 1,
              method: 1,
              status: 1,
              paidAt: 1,
              receiptNo: 1,
              note: 1,
              recordedBy: {
                $convert: { input: '$recordedBy', to: 'string', onError: null, onNull: null },
              },
              clientName: { $ifNull: ['$user.name', 'Contact Person'] },
              businessName: { $ifNull: ['$client.businessName', '—'] },
              clientPhone: '$user.phone',
              createdAt: 1,
              updatedAt: 1,
              _id: 0,
            },
          },
        ],
      },
    });

    const [result] = await this.model.aggregate(pipeline).allowDiskUse(true);
    const total = result?.metadata?.[0]?.total || 0;
    const items = result?.data || [];
    return { items, total };
  }

  async getPaymentSummary() {
    const [result] = await this.model
      .aggregate([
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  totalAmount: { $sum: '$amount' },
                  count: { $sum: 1 },
                },
              },
            ],
            byStatus: [
              {
                $group: {
                  _id: '$status',
                  count: { $sum: 1 },
                  amount: { $sum: '$amount' },
                },
              },
            ],
            byMethod: [
              {
                $group: {
                  _id: '$method',
                  count: { $sum: 1 },
                  amount: { $sum: '$amount' },
                },
              },
            ],
          },
        },
      ])
      .allowDiskUse(true);

    const totals = result?.totals?.[0] || { totalAmount: 0, count: 0 };
    const byStatus = {};
    for (const row of result?.byStatus || []) {
      byStatus[row._id] = { count: row.count, amount: row.amount };
    }
    const byMethod = {};
    for (const row of result?.byMethod || []) {
      byMethod[row._id] = { count: row.count, amount: row.amount };
    }

    return {
      totalAmount: Math.round((totals.totalAmount || 0) * 100) / 100,
      count: totals.count || 0,
      byStatus,
      byMethod,
    };
  }
}
