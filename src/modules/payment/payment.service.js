import { BaseService } from '../../shared/bases/base.service.js';
import { SystemConstants } from '../../shared/constants/system.constant.js';
import {
  ClientStatus,
  PaymentStatus,
} from '../../shared/constants/enum.constant.js';
import { ClientSubscriptionModel } from '../subscription/client-subscription.model.js';
import { InvoiceModel, getNextSequenceValue, InvoiceStatus, InvoiceType } from '../invoice/invoice.model.js';
import { NotificationModel } from '../notification/notification.model.js';
import { UserModel } from '../user/user.model.js';

export class PaymentService extends BaseService {
  constructor({
    paymentRepository,
    clientRepository,
    subscriptionRepository = null,
    redisService,
  }) {
    super();
    this.paymentRepository = paymentRepository;
    this.clientRepository = clientRepository;
    this.subscriptionRepository = subscriptionRepository;
    this.redisService = redisService;
  }

  async recordPayment(paymentData) {
    const {
      clientId,
      amount,
      method,
      status = PaymentStatus.PAID,
      paidAt,
      invoiceId,
      transactionId,
      note,
      subscriptionId: bodySubId,
      recordedBy,
    } = paymentData;

    const client = await this.clientRepository.findById(clientId);
    if (!client) {
      this.throwNotFound('Client');
    }

    const paidAtDate = paidAt ? new Date(paidAt) : new Date();
    const receiptNo = await this.#generateReceiptNo();

    let subscriptionId = bodySubId || null;
    if (!subscriptionId) {
      const currentSub = client.currentSubscriptionId;
      if (currentSub) {
        subscriptionId =
          typeof currentSub === 'object'
            ? currentSub._id || currentSub.id
            : currentSub;
      }
    }

    const numericAmount = Number(amount);

    const payload = {
      clientId,
      subscriptionId: subscriptionId || null,
      invoiceId: invoiceId ? String(invoiceId).trim() : null,
      transactionId: transactionId ? String(transactionId).trim() : null,
      amount: numericAmount,
      method: String(method || 'UPI').trim().toUpperCase().replace(/[\s-]+/g, '_'),
      status,
      paidAt: paidAtDate,
      receiptNo,
      note: note ? String(note).trim() : '',
    };

    if (recordedBy && /^[a-fA-F0-9]{24}$/.test(String(recordedBy))) {
      payload.recordedBy = recordedBy;
    }

    const payment = await this.paymentRepository.create(payload);

    // 1. Sync Client Subscription Paid & Remaining Balances
    let updatedSub = null;
    if (subscriptionId) {
      try {
        const sub = await ClientSubscriptionModel.findById(subscriptionId);
        if (sub) {
          const currentPaid = Number(sub.paidAmount || 0);
          const totalPlan = Number(
            sub.totalPlanPrice ||
            (sub.monthlyCharge ? Math.round(sub.monthlyCharge * 1.18 * 100) / 100 : numericAmount)
          );
          const newPaid = Math.round((currentPaid + numericAmount) * 100) / 100;
          const newRemaining = Math.max(0, Math.round((totalPlan - newPaid) * 100) / 100);

          sub.paidAmount = newPaid;
          sub.remainingAmount = newRemaining;
          sub.lastPaymentDate = paidAtDate;
          if (newRemaining <= 0) {
            sub.status = 'ACTIVE';
          }
          await sub.save();
          updatedSub = sub.toJSON ? sub.toJSON() : sub;
        }
      } catch (subErr) {
        console.error('Failed to sync subscription payment balance:', subErr);
      }
    }

    // 2. Auto-generate or Update Invoice for this payment
    let targetInvoice = null;
    try {
      if (invoiceId) {
        if (/^[a-fA-F0-9]{24}$/.test(String(invoiceId))) {
          targetInvoice = await InvoiceModel.findById(invoiceId).catch(() => null);
        }
        if (!targetInvoice) {
          targetInvoice = await InvoiceModel.findOne({ invoiceNumber: String(invoiceId).trim() }).catch(() => null);
        }
      }

      if (!targetInvoice && subscriptionId) {
        targetInvoice = await InvoiceModel.findOne({
          subscriptionId,
          clientId,
          status: { $ne: InvoiceStatus.CANCELLED },
        }).sort({ createdAt: -1 });
      }

      if (targetInvoice) {
        const currentInvPaid = Number(targetInvoice.amountPaid || 0);
        const newInvPaid = Math.round((currentInvPaid + numericAmount) * 100) / 100;
        const newInvDue = Math.max(0, Math.round((targetInvoice.totalAmount - newInvPaid) * 100) / 100);

        targetInvoice.amountPaid = newInvPaid;
        targetInvoice.amountDue = newInvDue;
        targetInvoice.status = newInvDue <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;
        if (newInvDue <= 0) {
          targetInvoice.paidAt = paidAtDate;
        }
        if (!targetInvoice.paymentTransactionId) {
          targetInvoice.paymentTransactionId = payment._id;
        }
        await targetInvoice.save();
      } else {
        // Generate new Invoice
        const seq = await getNextSequenceValue('invoiceNumber');
        const invNo = `INV-${new Date().getFullYear()}-${String(seq).padStart(5, '0')}`;
        
        const totalInvoicePrice = updatedSub?.totalPlanPrice || numericAmount;
        const subtotal = Math.round((totalInvoicePrice / 1.18) * 100) / 100;
        const taxAmount = Math.round((totalInvoicePrice - subtotal) * 100) / 100;
        const amountDue = Math.max(0, Math.round((totalInvoicePrice - numericAmount) * 100) / 100);
        const dueDate = new Date(paidAtDate);
        dueDate.setDate(dueDate.getDate() + 7);

        targetInvoice = await InvoiceModel.create({
          invoiceNumber: invNo,
          clientId,
          subscriptionId: subscriptionId || null,
          invoiceType: subscriptionId ? InvoiceType.RENEWAL : InvoiceType.CUSTOM,
          paymentTransactionId: payment._id,
          items: [
            {
              description: note || `CCTV Security Subscription Payment (${payload.method} - ${receiptNo})`,
              quantity: 1,
              unitPrice: subtotal,
              amount: subtotal,
            },
          ],
          currency: 'INR',
          subtotal,
          taxPercentage: 18,
          taxAmount,
          totalAmount: totalInvoicePrice,
          amountPaid: numericAmount,
          amountDue,
          status: amountDue <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID,
          issueDate: paidAtDate,
          dueDate,
          paidAt: amountDue <= 0 ? paidAtDate : null,
          pdfUrl: `/uploads/invoices/${invNo}.pdf`,
          pdfStatus: 'COMPLETED',
          notes: note || `Payment recorded via ${payload.method} (Ref: ${transactionId || receiptNo})`,
        });
      }

      if (targetInvoice && targetInvoice.invoiceNumber) {
        payment.invoiceId = targetInvoice.invoiceNumber;
        await payment.save();
      }
    } catch (invErr) {
      console.error('Invoice auto-generation/update failed:', invErr);
    }

    // 3. Reactivate client if subscription is fully paid or active
    const isFullyPaid = updatedSub ? (updatedSub.remainingAmount <= 0) : true;
    if (isFullyPaid && (client.status === ClientStatus.DUE || client.status === ClientStatus.SUSPENDED || client.status === ClientStatus.OVERDUE)) {
      await this.clientRepository.updateStatus(clientId, ClientStatus.ACTIVE).catch(() => { });
    }

    // 4. In-App Notification to Admins
    try {
      const admins = await UserModel.find({
        role: { $in: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTS_MANAGER', 'OPERATIONS_TEAM'] },
        status: 'ACTIVE',
      }).select('_id').lean().exec();

      if (admins.length > 0) {
        const clientObj = client.toJSON ? client.toJSON() : client;
        const displayName = clientObj.businessName || clientObj.name || 'A Client';
        const formattedAmount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(numericAmount);
        const notifications = admins.map((admin) => ({
          recipient: admin._id,
          title: 'Payment Recorded',
          message: `${displayName} paid ${formattedAmount} via ${payload.method} (Receipt: ${receiptNo})`,
          type: 'PAYMENT',
          priority: 'HIGH',
          channel: 'IN_APP',
          actionUrl: `/payments`,
          metadata: { paymentId: payment._id, clientId, amount: numericAmount, receiptNo },
          isRead: false,
        }));
        await NotificationModel.insertMany(notifications, { ordered: false }).catch(() => {});
      }
    } catch (notifErr) {
      console.error('Admin notification failed:', notifErr);
    }

    // 4. Redis Cache Invalidation
    try {
      await this.redisService.del('payment:summary');
      await this.redisService.del(`client:${clientId}`);
      await this.redisService.del('client:stats');
    } catch {
      // Redis optional
    }

    const clientObj = client.toJSON ? client.toJSON() : client;
    return {
      payment: {
        ...paymentObj,
        id: paymentObj.id || payment._id?.toString(),
        clientName: clientObj.userId?.name || 'Contact Person',
        businessName: clientObj.businessName,
      },
      invoice: targetInvoice ? (targetInvoice.toJSON ? targetInvoice.toJSON() : targetInvoice) : null,
      subscription: updatedSub,
      client: {
        id: clientObj.id || clientId,
        businessName: clientObj.businessName,
        status: isFullyPaid ? ClientStatus.ACTIVE : client.status,
      },
    };
  }

  async getPaymentById(id) {
    const payment = await this.paymentRepository.findById(id);
    if (!payment) {
      this.throwNotFound('Payment');
    }

    const paymentObj = payment.toJSON ? payment.toJSON() : payment;
    let businessName = null;
    let clientName = null;

    try {
      const client = await this.clientRepository.findById(
        payment.clientId?.toString?.() || payment.clientId,
      );
      if (client) {
        const c = client.toJSON ? client.toJSON() : client;
        businessName = c.businessName;
        clientName = c.userId?.name || null;
      }
    } catch {
      // enrichment optional
    }

    return {
      ...paymentObj,
      id: paymentObj.id || payment._id?.toString(),
      businessName,
      clientName,
    };
  }

  async listPayments(queryParams = {}) {
    const {
      page: qPage,
      limit: qLimit,
      search,
      method,
      status,
      clientId,
      from,
      to,
      sortBy,
      sortOrder,
    } = queryParams;
    const { page, limit, skip } = this.getPaginationParams(qPage, qLimit);

    const { items, total } =
      await this.paymentRepository.findPaginatedPaymentsWithAggregation({
        skip,
        limit,
        search,
        method: method && method !== 'all' ? method : null,
        status: status && status !== 'all' ? status : null,
        clientId: clientId || null,
        from: from || null,
        to: to || null,
        sortBy,
        sortOrder,
      });

    return { items, page, limit, total };
  }

  async listClientPayments(clientId, queryParams = {}) {
    const client = await this.clientRepository.findById(clientId);
    if (!client) {
      this.throwNotFound('Client');
    }
    return this.listPayments({ ...queryParams, clientId });
  }

  async getPaymentSummary() {
    const cacheKey = 'payment:summary';
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return { ...cached, _cached: true };
      }
    } catch {
      // Redis optional
    }

    const summary = await this.paymentRepository.getPaymentSummary();

    try {
      await this.redisService.set(
        cacheKey,
        summary,
        SystemConstants.CACHE_TTL.SHORT,
      );
    } catch {
      // Redis optional
    }

    return summary;
  }

  async #generateReceiptNo() {
    const day = new Date();
    const y = day.getFullYear();
    const m = String(day.getMonth() + 1).padStart(2, '0');
    const d = String(day.getDate()).padStart(2, '0');
    const prefix = `RCPT-${y}${m}${d}`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const suffix = Math.floor(1000 + Math.random() * 9000);
      const receiptNo = `${prefix}-${suffix}`;
      const existing = await this.paymentRepository.findByReceiptNo(receiptNo);
      if (!existing) return receiptNo;
    }

    return `${prefix}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  }
}
