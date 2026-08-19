import mongoose from 'mongoose';
import { BaseRepository } from '../../shared/bases/base.repository.js';
import { InvoiceModel } from './invoice.model.js';
import { env, getFullPdfUrl } from '../../config/env.config.js';

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

    if (clientId && clientId !== 'all' && clientId !== '' && mongoose.Types.ObjectId.isValid(clientId)) {
      queryFilter.clientId = new mongoose.Types.ObjectId(clientId);
    }
    if (status && status !== 'all' && String(status).trim() !== '') {
      queryFilter.status = String(status).trim().toUpperCase();
    }
    if (search && String(search).trim()) {
      const escaped = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      queryFilter.$or = [
        { invoiceNumber: { $regex: escaped, $options: 'i' } },
        { 'items.description': { $regex: escaped, $options: 'i' } }
      ];
    }

    const [rawItems, total] = await Promise.all([
      this.model
        .find(queryFilter)
        .populate({
          path: 'clientId',
          select: 'businessName gstin userId',
          populate: { path: 'userId', select: 'name email phone' }
        })
        .populate('subscriptionId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.model.countDocuments(queryFilter)
    ]);

    const folderPrefix = (env.BUCKET_FOLDER_PATH || 'CCTV/').replace(/^\/+/, '');
    const defaultCloudUrl = (invNo) => `https://${env.AWS_S3_BUCKET}.sgp1.digitaloceanspaces.com/${folderPrefix}invoices/${invNo}.pdf`;

    const items = (rawItems || []).map((inv) => {
      const client = inv.clientId || {};
      const user = client.userId || {};
      const totalAmount = inv.totalAmount || 0;
      const amountPaid = inv.amountPaid || 0;
      const totalTax = inv.taxAmount || 0;
      const cgst = inv.cgstAmount ?? Math.round((totalTax / 2) * 100) / 100;
      const sgst = inv.sgstAmount ?? Math.round((totalTax - cgst) * 100) / 100;

      return {
        ...inv,
        id: inv._id ? inv._id.toString() : (inv.id || inv.invoiceNumber),
        clientName: client.businessName || user.name || 'Contact Person',
        businessName: client.businessName || '—',
        clientPhone: user.phone || client.phone || '—',
        clientEmail: client.email || user.email || '—',
        taxableAmount: inv.subtotal || 0,
        cgst,
        sgst,
        cgstAmount: cgst,
        sgstAmount: sgst,
        igstAmount: inv.igstAmount || 0,
        amountDue: inv.amountDue ?? Math.max(0, totalAmount - amountPaid),
        balance: inv.amountDue ?? Math.max(0, totalAmount - amountPaid),
        pdfUrl: inv.pdfUrl || (inv.pdfStatus === 'COMPLETED' ? defaultCloudUrl(inv.invoiceNumber) : null)
      };
    });

    return { items, total };
  }
}
