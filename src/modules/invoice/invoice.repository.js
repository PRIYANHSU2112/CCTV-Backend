import { BaseRepository } from '../../shared/bases/base.repository.js';
import { InvoiceModel } from './invoice.model.js';

export class InvoiceRepository extends BaseRepository {
  constructor() {
    super();
    this.model = InvoiceModel;
  }

  async create(invoiceData, options = {}) {
    const invoice = new this.model(invoiceData);
    return invoice.save(options);
  }

  async findById(id, options = {}) {
    if (!id) return null;
    let query;
    const strId = String(id).trim();
    if (strId.length === 24 && /^[a-fA-F0-9]{24}$/.test(strId)) {
      query = this.model.findById(strId);
    } else {
      query = this.model.findOne({ invoiceNumber: strId.toUpperCase() });
    }
    query.populate({ path: 'clientId', populate: { path: 'userId', select: 'name email phone' } }).populate('subscriptionId');
    if (options.session) query.session(options.session);
    return query.exec();
  }

  async findByInvoiceNumber(invoiceNumber, options = {}) {
    const query = this.model.findOne({ invoiceNumber: String(invoiceNumber).toUpperCase() }).populate({ path: 'clientId', populate: { path: 'userId', select: 'name email phone' } });
    if (options.session) query.session(options.session);
    return query.exec();
  }

  async update(id, updateData, options = {}) {
    if (!id) return null;
    let filter;
    const strId = String(id).trim();
    if (strId.length === 24 && /^[a-fA-F0-9]{24}$/.test(strId)) {
      filter = { _id: strId };
    } else {
      filter = { invoiceNumber: strId.toUpperCase() };
    }
    const query = this.model.findOneAndUpdate(filter, { $set: updateData }, { new: true, runValidators: true }).populate({ path: 'clientId', populate: { path: 'userId', select: 'name email phone' } }).populate('subscriptionId');
    if (options.session) query.session(options.session);
    return query.exec();
  }

  async findPaginatedInvoices({ skip = 0, limit = 10, clientId = null, status = null, search = '' }) {
    const queryFilter = {};

    if (clientId) queryFilter.clientId = clientId;
    if (status && status !== 'all') queryFilter.status = status;
    if (search) {
      queryFilter.$or = [{ invoiceNumber: { $regex: search, $options: 'i' } }];
    }

    const [items, total] = await Promise.all([
      this.model
        .find(queryFilter)
        .populate({ path: 'clientId', select: 'businessName gstin userId', populate: { path: 'userId', select: 'name email phone' } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.model.countDocuments(queryFilter)
    ]);

    return { items, total };
  }
}
