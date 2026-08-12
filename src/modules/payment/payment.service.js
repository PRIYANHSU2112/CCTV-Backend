import { BaseService } from '../../shared/bases/base.service.js';
import { SystemConstants } from '../../shared/constants/system.constant.js';
import {
  ClientStatus,
  PaymentStatus,
} from '../../shared/constants/enum.constant.js';

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

    const payload = {
      clientId,
      subscriptionId: subscriptionId || null,
      invoiceId: invoiceId ? String(invoiceId).trim() : null,
      amount: Number(amount),
      method,
      status,
      paidAt: paidAtDate,
      receiptNo,
      note: note ? String(note).trim() : '',
    };

    if (recordedBy && /^[a-fA-F0-9]{24}$/.test(String(recordedBy))) {
      payload.recordedBy = recordedBy;
    }

    const payment = await this.paymentRepository.create(payload);
    const paymentObj = payment.toJSON ? payment.toJSON() : payment;

    // Side effects: lastPaymentDate + reactivate client when fully paid-style entry
    if (status === PaymentStatus.PAID || status === PaymentStatus.PARTIAL) {
      const subId = subscriptionId?.toString?.() || subscriptionId;
      if (subId && this.subscriptionRepository?.updateSubscription) {
        try {
          await this.subscriptionRepository.updateSubscription(subId, {
            lastPaymentDate: paidAtDate,
          });
        } catch {
          // Subscription update is best-effort
        }
      }

      if (
        status === PaymentStatus.PAID &&
        (client.status === ClientStatus.DUE ||
          client.status === ClientStatus.SUSPENDED ||
          client.status === ClientStatus.OVERDUE)
      ) {
        await this.clientRepository.updateStatus(clientId, ClientStatus.ACTIVE);
      }
    }

    try {
      await this.redisService.del('payment:summary');
      await this.redisService.del(`client:${clientId}`);
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
      client: {
        id: clientObj.id || clientId,
        businessName: clientObj.businessName,
        status:
          status === PaymentStatus.PAID &&
          (client.status === ClientStatus.DUE ||
            client.status === ClientStatus.SUSPENDED ||
            client.status === ClientStatus.OVERDUE)
            ? ClientStatus.ACTIVE
            : client.status,
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
