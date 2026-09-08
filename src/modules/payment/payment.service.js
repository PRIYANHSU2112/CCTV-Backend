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
import { getFullPdfUrl } from '../../config/env.config.js';
import { PdfService } from '../invoice/pdf.service.js';
import { S3Service } from '../../shared/storage/s3.service.js';
import { extractGstFromInclusive, roundMoney, toPaise } from '../../shared/utils/money.util.js';
import { sendPaymentReceiptEmail } from '../../shared/services/email.service.js';
import { CompanyModel } from '../company/company.model.js';
import { logger } from '../../shared/utils/logger.js';


export class PaymentService extends BaseService {
  constructor(opts = {}) {
    super();
    this.paymentRepository = opts.paymentRepository;
    this.clientRepository = opts.clientRepository;
    this.subscriptionRepository = opts.subscriptionRepository;
    this.redisService = opts.redisService;
    this.pdfService = opts.pdfService || null;
    this.s3Service = opts.s3Service || null;
    this.postPaymentQueueService = opts.postPaymentQueueService || null;
  }

  /**
   * Record a manual admin payment.
   *
   * Accounting model:
   *   - If an unpaid/partially-paid invoice exists for this subscription → update it
   *   - If no such invoice exists → create a new invoice for this payment
   *   - Never use the full subscription price as the new invoice total when
   *     recording a small partial payment
   */
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
      applyInstallationCharge,
      installationCharge,
      installationGst,
      installationHsnSac,
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

    const numericAmount = roundMoney(Number(amount));
    if (numericAmount <= 0) {
      this.throwBadRequest('Payment amount must be greater than 0');
    }

    // Resolve installation charge
    let installBase = 0;
    let installGst = 0;
    let installHsnSac = '995469';

    const shouldApplyInstallation = applyInstallationCharge !== undefined
      ? Boolean(applyInstallationCharge)
      : (installationCharge !== undefined && Number(installationCharge) > 0);

    if (shouldApplyInstallation) {
      let companyDoc = null;
      try {
        companyDoc = await CompanyModel.findOne().lean().exec();
      } catch {
        // Safe fallback
      }

      installBase = installationCharge !== undefined && installationCharge !== null
        ? roundMoney(Number(installationCharge))
        : Number(companyDoc?.installationCharge !== undefined ? companyDoc.installationCharge : (companyDoc?.financialDefaults?.installationCharge ?? 6000));

      installHsnSac = installationHsnSac || companyDoc?.installationHsnSac || companyDoc?.financialDefaults?.installationHsnSac || '995469';

      const installGstEnabled = companyDoc?.installationGstEnabled !== undefined
        ? Boolean(companyDoc.installationGstEnabled)
        : (companyDoc?.financialDefaults?.installationGstEnabled !== undefined
            ? Boolean(companyDoc.financialDefaults.installationGstEnabled)
            : true);

      const installGstRate = Number(
        companyDoc?.installationGstRate !== undefined
          ? companyDoc.installationGstRate
          : (companyDoc?.financialDefaults?.installationGstRate ?? 18)
      );

      installGst = installationGst !== undefined && installationGst !== null
        ? roundMoney(Number(installationGst))
        : (installGstEnabled ? roundMoney(installBase * (installGstRate / 100)) : 0);
    }

    const payload = {
      clientId,
      subscriptionId: subscriptionId || null,
      invoiceId: invoiceId ? String(invoiceId).trim() : null,
      transactionId: transactionId ? String(transactionId).trim() : null,
      amount: numericAmount,
      amountPaise: toPaise(numericAmount),
      method: String(method || 'CASH').trim().toUpperCase().replace(/[\s-]+/g, '_'),
      status,
      paidAt: paidAtDate,
      receiptNo,
      note: note ? String(note).trim() : '',
      installationCharge: installBase,
      installationGst: installGst,
      installationHsnSac: installHsnSac,
    };

    if (recordedBy && /^[a-fA-F0-9]{24}$/.test(String(recordedBy))) {
      payload.recordedBy = recordedBy;
    }

    const payment = await this.paymentRepository.create(payload);

    // ──────────────────────────────────────────────────────────────────────
    // 1. Sync Client Subscription Paid & Remaining Balances
    // ──────────────────────────────────────────────────────────────────────
    let updatedSub = null;
    if (subscriptionId) {
      try {
        let sub = null;
        try {
          sub = await ClientSubscriptionModel.findById(subscriptionId).populate('planId');
        } catch {
          // Safe Mongo model bypass in unit tests
        }

        if (sub) {
          const planGstRate = sub.planId?.gstPercentage !== undefined
            ? Number(sub.planId.gstPercentage)
            : (sub.gstPercentage !== undefined ? Number(sub.gstPercentage) : 0);

          // If installation charge is applied via payment and was not recorded on subscription yet, incorporate it
          if (installBase > 0 && (!sub.installationCharge || sub.installationCharge <= 0)) {
            sub.installationCharge = installBase;
            sub.installationGst = installGst;
            sub.installationHsnSac = installHsnSac;
            const extraInstallation = roundMoney(installBase + installGst);
            sub.totalPlanPrice = roundMoney((sub.totalPlanPrice || 0) + extraInstallation);
          }

          const currentPaid = roundMoney(Number(sub.paidAmount || 0));
          const totalPlan = roundMoney(Number(
            sub.totalPlanPrice ||
            (sub.monthlyCharge ? Math.round(sub.monthlyCharge * (sub.durationInMonths || 1) * (1 + planGstRate / 100) * 100) / 100 : numericAmount)
          ));
          const newPaid = roundMoney(currentPaid + numericAmount);
          const newRemaining = roundMoney(Math.max(0, totalPlan - newPaid));

          sub.paidAmount = newPaid;
          sub.remainingAmount = newRemaining;
          sub.lastPaymentDate = paidAtDate;
          if (newRemaining <= 0) {
            sub.status = 'ACTIVE';
          }
          await sub.save();
          if (this.subscriptionRepository) {
            await this.subscriptionRepository.updateSubscription(subscriptionId, {
              lastPaymentDate: paidAtDate,
              paidAmount: newPaid,
              remainingAmount: newRemaining,
              ...(installBase > 0 ? {
                installationCharge: sub.installationCharge,
                installationGst: sub.installationGst,
                installationHsnSac: sub.installationHsnSac,
                totalPlanPrice: sub.totalPlanPrice,
              } : {})
            }).catch(() => {});
          }
          updatedSub = sub.toJSON ? sub.toJSON() : sub;
        } else if (this.subscriptionRepository) {
          const updated = await this.subscriptionRepository.updateSubscription(subscriptionId, {
            lastPaymentDate: paidAtDate,
          }).catch(() => {});
          if (updated) updatedSub = updated.toJSON ? updated.toJSON() : updated;
        }
      } catch (subErr) {
        logger.error({ msg: 'Failed to sync subscription payment balance', err: subErr.message });
      }
    }

    // ──────────────────────────────────────────────────────────────────────
    // 2. Reactivate client if subscription is fully paid
    // ──────────────────────────────────────────────────────────────────────
    const isFullyPaid = updatedSub
      ? (updatedSub.remainingAmount !== undefined && updatedSub.remainingAmount !== null ? updatedSub.remainingAmount <= 0 : true)
      : true;
    if (isFullyPaid && (client.status === ClientStatus.DUE || client.status === 'Due' || client.status === ClientStatus.SUSPENDED || client.status === ClientStatus.OVERDUE)) {
      await this.clientRepository.updateStatus(clientId, ClientStatus.ACTIVE).catch(() => { });
    }

    // ──────────────────────────────────────────────────────────────────────
    // 3. Invalidate Redis Caches
    // ──────────────────────────────────────────────────────────────────────
    try {
      await this.redisService.del('payment:summary');
      await this.redisService.del(`client:${clientId}`);
      await this.redisService.del('client:stats');
    } catch {
      // Redis optional
    }

    const clientObj = client.toJSON ? client.toJSON() : client;
    const paymentObj = payment && payment.toJSON ? payment.toJSON() : (payment || {});
    const paymentId = (payment._id || payment.id)?.toString();

    // ──────────────────────────────────────────────────────────────────────
    // 4. Synchronously Sync & Update Authoritative Invoice & PDF
    // ──────────────────────────────────────────────────────────────────────
    const targetInvoice = await this.#handleInlineInvoiceFallback({
      clientId,
      subscriptionId,
      payment,
      invoiceId,
      numericAmount,
      paidAtDate,
      updatedSub,
      client,
      note,
      payload,
      receiptNo,
      isFullyPaid
    });

    if (this.postPaymentQueueService) {
      await this.postPaymentQueueService.addAdminNotificationJob({
        paymentId,
        clientId: String(clientId),
        amount: numericAmount,
        receiptNo,
        customerName: clientObj.userId?.name || clientObj.name || 'Client',
        businessName: clientObj.businessName || 'Business Account',
        planName: updatedSub?.packageTier || 'CCTV Subscription Plan',
      }).catch((err) => {
        logger.warn(`Could not enqueue admin notification job for payment [${paymentId}]: ${err.message}`);
      });
    }

    return {
      success: true,
      message: 'Payment recorded successfully. Invoice generation, PDF rendering, and email delivery queued in background.',
      payment: {
        ...paymentObj,
        id: paymentObj.id || payment?._id?.toString() || paymentObj._id?.toString(),
        clientName: clientObj.userId?.name || clientObj.name || 'Contact Person',
        businessName: clientObj.businessName || '—',
        receiptNo: paymentObj.receiptNo || receiptNo,
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

  /**
   * Fallback for invoice generation and delivery when BullMQ is not configured.
   */
  async #handleInlineInvoiceFallback({
    clientId,
    subscriptionId,
    payment,
    invoiceId,
    numericAmount,
    paidAtDate,
    updatedSub,
    client,
    note,
    payload,
    receiptNo
  }) {
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
        targetInvoice = await InvoiceModel.findOne({ subscriptionId }).sort({ createdAt: -1 });
      }

      if (!targetInvoice && clientId) {
        targetInvoice = await InvoiceModel.findOne({ clientId }).sort({ createdAt: -1 });
      }

      const planGstRate = updatedSub?.planId?.gstPercentage !== undefined
        ? Number(updatedSub.planId.gstPercentage)
        : (updatedSub?.gstPercentage !== undefined ? Number(updatedSub.gstPercentage) : 0);

      const hasInstallation = Boolean(
        (payment?.installationCharge && payment.installationCharge > 0) ||
        (updatedSub?.installationCharge && updatedSub.installationCharge > 0)
      );
      const installBase = hasInstallation
        ? roundMoney(Number(payment?.installationCharge || updatedSub?.installationCharge || 0))
        : 0;
      const installGst = hasInstallation
        ? roundMoney(Number(payment?.installationGst || updatedSub?.installationGst || 0))
        : 0;
      const installHsnSac = payment?.installationHsnSac || updatedSub?.installationHsnSac || '995469';

      const hasSub = updatedSub && updatedSub.totalPlanPrice > 0;
      const fullTotal = hasSub ? roundMoney(updatedSub.totalPlanPrice) : numericAmount;

      const planGrossTotal = hasInstallation
        ? roundMoney(Math.max(0, fullTotal - (installBase + installGst)))
        : fullTotal;

      const planGst = extractGstFromInclusive(planGrossTotal > 0 ? planGrossTotal : fullTotal, planGstRate, false);

      const subtotal = hasInstallation
        ? roundMoney(planGst.baseAmount + installBase)
        : planGst.baseAmount;

      const totalTaxAmount = hasInstallation
        ? roundMoney(planGst.gstAmount + installGst)
        : planGst.gstAmount;

      const cgstAmount = roundMoney(totalTaxAmount / 2);
      const sgstAmount = roundMoney(totalTaxAmount - cgstAmount);
      const calculatedTotal = roundMoney(subtotal + totalTaxAmount);

      const totalPaidOnSub = hasSub && updatedSub.paidAmount !== undefined
        ? roundMoney(Number(updatedSub.paidAmount))
        : roundMoney(Number(targetInvoice?.amountPaid || 0) + numericAmount);

      const description = hasSub
        ? `${updatedSub.packageTier || 'CCTV'} Security Subscription Service`
        : (note || 'CCTV Security Service Payment');

      const invoiceItems = [
        {
          description,
          hsnSac: '998529',
          quantity: 1,
          unitPrice: planGst.baseAmount,
          amount: planGst.baseAmount,
        }
      ];

      if (hasInstallation && installBase > 0) {
        invoiceItems.push({
          description: 'CCTV System One-Time Installation & Setup Charge',
          hsnSac: installHsnSac,
          quantity: 1,
          unitPrice: installBase,
          amount: installBase,
        });
      }

      if (targetInvoice) {
        if (hasSub && (targetInvoice.totalAmount < calculatedTotal || (hasInstallation && targetInvoice.items?.length === 1))) {
          targetInvoice.subtotal = subtotal;
          targetInvoice.taxPercentage = planGstRate;
          targetInvoice.taxAmount = totalTaxAmount;
          targetInvoice.cgstAmount = cgstAmount;
          targetInvoice.sgstAmount = sgstAmount;
          targetInvoice.totalAmount = calculatedTotal;
          targetInvoice.items = invoiceItems;
        }

        const newInvDue = roundMoney(Math.max(0, targetInvoice.totalAmount - totalPaidOnSub));

        targetInvoice.amountPaid = totalPaidOnSub;
        targetInvoice.amountDue = newInvDue;
        targetInvoice.status = newInvDue <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;
        if (newInvDue <= 0) {
          targetInvoice.paidAt = paidAtDate;
        }
        if (!targetInvoice.paymentTransactionId) {
          targetInvoice.paymentTransactionId = payment._id;
        }
        targetInvoice.pdfStatus = 'PENDING';
        await targetInvoice.save();

        await this.#tryGenerateAndUploadPdf(targetInvoice, client);
      } else {
        const seq = await getNextSequenceValue('invoiceNumber');
        const invNo = `INV-${new Date().getFullYear()}-${String(seq).padStart(5, '0')}`;

        const amountDue = roundMoney(Math.max(0, calculatedTotal - totalPaidOnSub));
        const invoiceStatus = amountDue <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;

        const dueDate = new Date(paidAtDate);
        dueDate.setDate(dueDate.getDate() + 7);

        targetInvoice = await InvoiceModel.create({
          invoiceNumber: invNo,
          clientId,
          subscriptionId: subscriptionId || null,
          invoiceType: hasInstallation ? InvoiceType.NEW_PLAN : (subscriptionId ? InvoiceType.RENEWAL : InvoiceType.CUSTOM),
          paymentTransactionId: payment._id,
          items: invoiceItems,
          currency: 'INR',
          subtotal,
          taxPercentage: planGstRate,
          taxAmount: totalTaxAmount,
          cgstAmount,
          sgstAmount,
          igstAmount: 0,
          totalAmount: calculatedTotal,
          amountPaid: totalPaidOnSub,
          amountDue,
          status: invoiceStatus,
          issueDate: paidAtDate,
          dueDate,
          paidAt: amountDue <= 0 ? paidAtDate : null,
          pdfStatus: 'PENDING',
          notes: note || `Payment recorded via ${payload.method}`,
        });

        await this.#tryGenerateAndUploadPdf(targetInvoice, client);
      }

      if (targetInvoice && targetInvoice.invoiceNumber && payment) {
        payment.invoiceId = targetInvoice.invoiceNumber;
        if (typeof payment.save === 'function') {
          await payment.save();
        } else if ((payment._id || payment.id) && typeof this.paymentRepository?.update === 'function') {
          await this.paymentRepository.update(payment._id || payment.id, {
            invoiceId: targetInvoice.invoiceNumber,
          });
        }
      }
    } catch (invErr) {
      logger.error({ msg: 'Invoice inline fallback failed', err: invErr.message });
    }

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
          metadata: { paymentId: payment?._id || payment?.id, clientId, amount: numericAmount, receiptNo },
          isRead: false,
        }));
        await NotificationModel.insertMany(notifications, { ordered: false }).catch(() => {});
      }
    } catch (notifErr) {
      logger.error({ msg: 'Admin inline notification failed', err: notifErr.message });
    }

    const clientObj = client.toJSON ? client.toJSON() : client;
    const paymentObj = payment && payment.toJSON ? payment.toJSON() : (payment || {});
    const recipientEmail = clientObj.email || clientObj.userId?.email;
    if (recipientEmail) {
      sendPaymentReceiptEmail({
        to: recipientEmail,
        client: clientObj,
        payment: paymentObj,
        invoice: targetInvoice ? (targetInvoice.toJSON ? targetInvoice.toJSON() : targetInvoice) : null,
        pdfUrl: targetInvoice?.pdfUrl || null,
      }).catch(err => logger.error(`Record payment inline email notification failed: ${err.message}`));
    }

    return targetInvoice;
  }

  /**
   * Generate PDF and upload to S3. Updates invoice record on success.
   * Safe — never throws, logs errors instead.
   */
  async #tryGenerateAndUploadPdf(invoice, client) {
    if (process.env.NODE_ENV === 'test' && !this.pdfService) return;
    try {
      const pdfService = this.pdfService || new PdfService();
      const s3Service = this.s3Service || new S3Service();

      // Populate client data for PDF rendering
      const clientData = client?.toJSON ? client.toJSON() : client;
      const pdfBuffer = await pdfService.generateInvoicePdfBuffer(invoice, clientData);

      if (!pdfBuffer || pdfBuffer.length === 0) {
        logger.warn(`PDF generation returned empty buffer for invoice ${invoice.invoiceNumber}`);
        return;
      }

      const cloudUrl = await s3Service.uploadFile(
        pdfBuffer,
        `invoices/${invoice.invoiceNumber}.pdf`,
        'application/pdf'
      );

      if (cloudUrl) {
        invoice.pdfUrl = cloudUrl;
        invoice.pdfStatus = 'COMPLETED';
        invoice.pdfGeneratedAt = new Date();
        await invoice.save();
        logger.info({ msg: 'PDF generated and uploaded successfully', invoiceNumber: invoice.invoiceNumber, pdfUrl: cloudUrl });
      }
    } catch (pdfErr) {
      logger.warn({ msg: 'PDF generation/upload failed, will retry via worker', invoiceNumber: invoice.invoiceNumber, err: pdfErr.message });
      // Don't set a fake URL — leave pdfStatus as PENDING for worker retry
    }
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
