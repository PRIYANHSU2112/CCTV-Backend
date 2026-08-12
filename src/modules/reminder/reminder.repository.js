import { BaseRepository } from '../../shared/bases/base.repository.js';
import { ReminderRuleModel, ReminderLogModel } from './reminder.model.js';

export class ReminderRepository extends BaseRepository {
  constructor() {
    super();
    this.model = ReminderRuleModel;
    this.logModel = ReminderLogModel;
  }

  async createRule(data) {
    const rule = new this.model(data);
    return rule.save();
  }

  async findRuleById(id) {
    if (!id || typeof id !== 'string' || id.length !== 24) return null;
    return this.model.findById(id).exec();
  }

  async updateRule(id, updateData) {
    return this.model.findByIdAndUpdate(id, { $set: updateData }, { new: true, runValidators: true }).exec();
  }

  async deleteRule(id) {
    return this.model.findByIdAndDelete(id).exec();
  }

  async findPaginatedRules({ skip = 0, limit = 10, status = null, search = '' }) {
    const query = {};
    if (status && status !== 'all') query.status = status;
    if (search) query.title = { $regex: search, $options: 'i' };

    const [items, total] = await Promise.all([
      this.model.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.model.countDocuments(query)
    ]);
    return { items, total };
  }

  async findPaginatedLogs({ skip = 0, limit = 10, status = null, channel = null }) {
    const query = {};
    if (status && status !== 'all') query.status = status;
    if (channel && channel !== 'all') query.channel = channel;

    const [items, total] = await Promise.all([
      this.logModel.find(query).populate('clientId', 'name phone').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.logModel.countDocuments(query)
    ]);
    return { items, total };
  }

  async getConfig() {
    return this.configStore || [
      { id: 'rem-7-before', label: '7 Days Before Due Date', days: -7, enabled: true, channels: ['WhatsApp', 'Email'] },
      { id: 'rem-3-before', label: '3 Days Before Due Date', days: -3, enabled: true, channels: ['WhatsApp', 'SMS'] },
      { id: 'rem-due-day', label: 'On Due Date', days: 0, enabled: true, channels: ['WhatsApp', 'SMS', 'Email'] },
      { id: 'rem-3-after', label: '3 Days After Due Date (Overdue)', days: 3, enabled: true, channels: ['WhatsApp', 'SMS'] },
      { id: 'rem-7-after', label: '7 Days After Due Date (Final Notice)', days: 7, enabled: true, channels: ['WhatsApp', 'SMS', 'Email'] },
    ];
  }

  async saveConfig(config) {
    this.configStore = config;
    return config;
  }
}
