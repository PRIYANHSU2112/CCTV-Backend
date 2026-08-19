import { BaseRepository } from '../../shared/bases/base.repository.js';
import { ClientModel } from './client.model.js';

export class ClientRepository extends BaseRepository {
  constructor() {
    super();
    this.model = ClientModel;
  }

  async findById(id) {
    if (!id || typeof id !== 'string' || id.length !== 24) {
      return null;
    }
    return this.model
      .findById(id)
      .populate('userId', 'name phone email role status lastLogin')
      .populate('currentSubscriptionId')
      .exec();
  }

  async findByUserId(userId, options = {}) {
    const query = this.model.findOne({ userId });
    if (options.session) query.session(options.session);
    if (!options.lean) {
      query
        .populate('userId', 'name phone email role status lastLogin')
        .populate('currentSubscriptionId');
    }
    return query.exec();
  }

  async findByBusinessName(businessName) {
    return this.model.findOne({ businessName: new RegExp(`^${businessName}$`, 'i') }).exec();
  }

  async create(clientData, options = {}) {
    const client = new this.model(clientData);
    return client.save(options);
  }

  async update(id, updateData, options = {}) {
    return this.model
      .findByIdAndUpdate(id, { $set: updateData }, {
        new: true,
        runValidators: true,
        session: options.session,
      })
      .populate('userId', 'name phone email role status')
      .populate('currentSubscriptionId')
      .exec();
  }

  async updateStatus(id, status, options = {}) {
    return this.model
      .findByIdAndUpdate(id, { $set: { status } }, {
        new: true,
        session: options.session,
      })
      .populate('userId', 'name phone email')
      .exec();
  }

  async addCamera(id, cameraData) {
    const client = await this.model.findById(id);
    if (!client) return null;

    client.cameras.push(cameraData);
    client.totalCamerasInstalled = client.cameras.length;
    return client.save();
  }

  async delete(id) {
    return this.model.findByIdAndDelete(id).exec();
  }

  /**
   * MongoDB Aggregation Pipeline for paginated client search & filtering
   */
  async findPaginatedClientsWithAggregation({
    skip = 0,
    limit = 10,
    search = '',
    city = null,
    status = null,
    hasSubscription = false,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  }) {
    const matchConditions = {};

    if (city) {
      matchConditions['installationAddress.city'] = new RegExp(city, 'i');
    }

    if (status) {
      matchConditions.status = status;
    }

    const isHasSub = hasSubscription === true || hasSubscription === 'true' || hasSubscription === '1';

    const sortDirection = sortOrder === 'asc' ? 1 : -1;

    const pipeline = [
      { $match: matchConditions },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'clientsubscriptions',
          localField: 'currentSubscriptionId',
          foreignField: '_id',
          as: 'subscription'
        }
      },
      { $unwind: { path: '$subscription', preserveNullAndEmptyArrays: true } }
    ];

    if (isHasSub) {
      pipeline.push({
        $match: {
          $or: [
            { currentSubscriptionId: { $exists: true, $ne: null } },
            { 'subscription._id': { $exists: true, $ne: null } }
          ]
        }
      });
    }

    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { businessName: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { 'user.name': { $regex: search, $options: 'i' } },
            { 'user.phone': { $regex: search, $options: 'i' } },
            { 'user.email': { $regex: search, $options: 'i' } },
            { 'installationAddress.city': { $regex: search, $options: 'i' } }
          ]
        }
      });
    }

    pipeline.push({
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [
          { $sort: { [sortBy]: sortDirection } },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              id: '$_id',
              userId: '$user._id',
              name: '$user.name',
              phone: '$user.phone',
              email: { $ifNull: ['$email', '$user.email'] },
              businessName: 1,
              gstin: 1,
              address: '$installationAddress.address',
              city: '$installationAddress.city',
              pincode: '$installationAddress.pincode',
              state: '$installationAddress.state',
              totalCamerasInstalled: 1,
              camerasCount: { $size: { $ifNull: ['$cameras', []] } },
              status: 1,
              subscriptionId: '$subscription._id',
              packageTier: '$subscription.packageTier',
              monthlyCharge: '$subscription.monthlyCharge',
              renewalDate: '$subscription.renewalDate',
              autoRenew: '$subscription.autoRenewal',
              createdAt: 1,
              updatedAt: 1,
              _id: 0
            }
          }
        ]
      }
    });

    const [result] = await this.model.aggregate(pipeline);
    const total = result?.metadata[0]?.total || 0;
    const items = result?.data || [];

    return { items, total };
  }

  /**
   * Aggregate stats for Clients dashboard KPI cards
   */
  async getClientStats() {
    const pipeline = [
      {
        $facet: {
          total: [{ $count: 'count' }],
          active: [{ $match: { status: 'Active' } }, { $count: 'count' }],
          due: [{ $match: { status: 'Due' } }, { $count: 'count' }],
          overdue: [{ $match: { status: 'Overdue' } }, { $count: 'count' }],
          suspended: [{ $match: { status: 'Suspended' } }, { $count: 'count' }],
          totalCameras: [{ $group: { _id: null, sum: { $sum: '$totalCamerasInstalled' } } }]
        }
      }
    ];

    const [result] = await this.model.aggregate(pipeline);

    return {
      totalClients: result?.total[0]?.count || 0,
      activeClients: result?.active[0]?.count || 0,
      dueClients: result?.due[0]?.count || 0,
      overdueClients: result?.overdue[0]?.count || 0,
      suspendedClients: result?.suspended[0]?.count || 0,
      totalCameras: result?.totalCameras[0]?.sum || 0
    };
  }
}
