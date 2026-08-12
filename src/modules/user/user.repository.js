import { BaseRepository } from '../../shared/bases/base.repository.js';
import { UserModel } from './user.model.js';

export class UserRepository extends BaseRepository {
  constructor() {
    super();
    this.model = UserModel;
  }

  async findByPhone(phone, includePassword = false, options = {}) {
    const query = this.model.findOne({ phone: phone.trim() });
    if (includePassword) {
      query.select('+password');
    }
    if (options.session) query.session(options.session);
    return query.exec();
  }

  async findByUsernameOrEmail(identifier, includePassword = false) {
    const clean = identifier.trim().toLowerCase();
    const query = this.model.findOne({
      $or: [{ username: clean }, { email: clean }]
    });
    if (includePassword) {
      query.select('+password');
    }
    return query.exec();
  }

  async findByEmail(email, includePassword = false) {
    if (!email) return null;
    const query = this.model.findOne({ email: email.toLowerCase().trim() });
    if (includePassword) {
      query.select('+password');
    }
    return query.exec();
  }

  async findById(id) {
    return this.model.findById(id).exec();
  }

  async create(userData, options = {}) {
    const user = new this.model(userData);
    return user.save(options);
  }

  async update(id, updateData) {
    return this.model.findByIdAndUpdate(id, { $set: updateData }, { new: true, runValidators: true }).exec();
  }

  async updateStatus(id, status) {
    return this.model.findByIdAndUpdate(id, { $set: { status } }, { new: true }).exec();
  }

  async updateLastLogin(id) {
    return this.model.findByIdAndUpdate(id, { $set: { lastLogin: new Date() } }, { new: true }).exec();
  }

  async delete(id) {
    return this.model.findByIdAndDelete(id).exec();
  }

  /**
   * High-Performance MongoDB Aggregation Pipeline for paginated users search & filtering
   */
  async findPaginatedWithAggregation({
    skip = 0,
    limit = 10,
    search = '',
    role = null,
    status = null,
    staffOnly = true,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  }) {
    const matchConditions = {};

    if (search) {
      matchConditions.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (role && role !== 'all') {
      matchConditions.role = role;
    } else if (staffOnly) {
      matchConditions.role = { $ne: 'CLIENT' };
    }

    if (status && status !== 'all') {
      matchConditions.status = status;
    }

    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const sortStage = { [sortBy]: sortDirection };

    const pipeline = [
      { $match: matchConditions },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [
            { $sort: sortStage },
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                id: '$_id',
                name: 1,
                phone: 1,
                username: 1,
                email: 1,
                role: 1,
                status: 1,
                lastLogin: 1,
                createdAt: 1,
                updatedAt: 1,
                _id: 0
              }
            }
          ]
        }
      }
    ];

    const [result] = await this.model.aggregate(pipeline);
    const total = result.metadata[0]?.total || 0;
    const items = result.data || [];

    return { items, total };
  }
}
