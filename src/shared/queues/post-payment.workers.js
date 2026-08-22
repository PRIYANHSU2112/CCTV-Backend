import { ADMIN_NOTIFICATION_QUEUE, INVOICE_PIPELINE_QUEUE } from './post-payment-queue.service.js';
import { NotificationModel } from '../../modules/notification/notification.model.js';
import { InvoiceModel, InvoiceStatus, InvoiceType, PdfStatus, getNextSequenceValue } from '../../modules/invoice/invoice.model.js';
import { PaymentTransactionModel } from '../../modules/payment/payment-transaction.model.js';
import { ClientSubscriptionModel } from '../../modules/subscription/client-subscription.model.js';

import { UserModel } from '../../modules/user/user.model.js';
import { env, getFullPdfUrl } from '../../config/env.config.js';
import { extractGstFromInclusive, roundMoney } from '../utils/money.util.js';
import { logger } from '../utils/logger.js';

let Worker = null;
try {
  const bullmq = await import('bullmq');
  Worker = bullmq.Worker || bullmq.default?.Worker;
} catch (err) {
  logger.warn('⚠️ [BullMQ Worker] Module loading failed or missing in environment.');
}

import { sendInvoiceEmail } from '../services/email.service.js';


/**
 * Post-Payment Background Workers
 *
 * Initializes two independent BullMQ workers:
 * 1. AdminNotificationWorker — creates in-app notification for admin users
 * 2. InvoicePipelineWorker — generates/updates invoice → triggers PDF → sends notification
 */
export class PostPaymentWorkers {
  constructor({ redisClient, pdfQueueService = null }) {
    this.pdfQueueService = pdfQueueService;

    if (!Worker) {
      logger.warn('⚠️ PostPaymentWorkers disabled because BullMQ Worker module is not available.');
      return;
    }

    const connection = redisClient.duplicate
      ? redisClient.duplicate({ maxRetriesPerRequest: null, enableOfflineQueue: true })
      : { host: process.env.REDIS_HOST || 'redis', port: Number(process.env.REDIS_PORT || 6379), maxRetriesPerRequest: null };

    // ──── Worker 1: Admin Notification ────
    this.adminWorker = new Worker(
      ADMIN_NOTIFICATION_QUEUE,
      async (job) => this.processAdminNotification(job),
      { connection, concurrency: 5 }
    );

    this.adminWorker.on('completed', (job) => {
      logger.info(`✅ Admin Notification Worker Completed Job [${job.id}]`);
    });
    this.adminWorker.on('failed', (job, err) => {
      logger.error(`❌ Admin Notification Worker Failed Job [${job?.id}]: ${err.message}`);
    });

    // ──── Worker 2: Invoice Pipeline ────
    this.invoiceWorker = new Worker(
      INVOICE_PIPELINE_QUEUE,
      async (job) => this.processInvoicePipeline(job),
      { connection, concurrency: 3 }
    );

    this.invoiceWorker.on('completed', (job) => {
      logger.info(`✅ Invoice Pipeline Worker Completed Job [${job.id}]`);
    });
    this.invoiceWorker.on('failed', (job, err) => {
      logger.error(`❌ Invoice Pipeline Worker Failed Job [${job?.id}]: ${err.message}`);
    });

    logger.info(`👷 Post-Payment Workers Started: [${ADMIN_NOTIFICATION_QUEUE}], [${INVOICE_PIPELINE_QUEUE}]`);
  }

  /**
   * Worker 1: Create in-app notification for admin/super-admin users
   */
  async processAdminNotification(job) {
    const { paymentId, amount, receiptNo, customerName, businessName, planName } = job.data;
    logger.info(`⚙️ Processing Admin Notification for Payment [${paymentId}]`);

    const admins = await UserModel.find({
      role: { $in: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTS_MANAGER'] },
      status: 'ACTIVE'
    }).select('_id').lean().exec();

    if (!admins.length) {
      logger.warn('No active admin users found to notify');
      return { skipped: true, reason: 'no_admins' };
    }

    const displayName = businessName || customerName || 'A client';
    const formattedAmount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);

    const notifications = admins.map(admin => ({
      recipient: admin._id,
      title: 'Payment Received',
      message: `${displayName} paid ${formattedAmount} (Receipt: ${receiptNo})${planName ? ` for plan "${planName}"` : ''}`,
      type: 'PAYMENT',
      priority: 'HIGH',
      channel: 'IN_APP',
      actionUrl: `/payments/${paymentId}`,
      metadata: { paymentId, amount, receiptNo, planName }
    }));

    await NotificationModel.insertMany(notifications, { ordered: false });

    logger.info(`🔔 Created ${notifications.length} admin notifications for payment [${paymentId}]`);
    return { notified: notifications.length };
  }

  /**
   * Worker 2: Invoice Pipeline — Generate/Update Single Authoritative Invoice → PDF → Delivery
   *
   * Prevents duplicate invoice creation:
   * - If a subscription exists, maintains EXACTLY 1 authoritative billing invoice.
   * - Subsequent partial/balance payments update that existing invoice's amountPaid and amountDue.
   */
  async processInvoicePipeline(job) {
    const { paymentId, clientId, subscriptionId, amount, planName, sessionId, customer } = job.data;
    logger.info(`⚙️ Processing Invoice Pipeline for Payment [${paymentId}]`);

    // ── Step 0: Check if invoice already linked to this exact payment ──
    const existingForPayment = await InvoiceModel.findOne({ paymentTransactionId: paymentId }).exec();
    if (existingForPayment) {
      logger.info(`📋 Invoice already linked for payment [${paymentId}]: ${existingForPayment.invoiceNumber}.`);
      if (this.pdfQueueService) {
        await this.pdfQueueService.addPdfJob(existingForPayment._id.toString()).catch(() => { });
      }
      return { idempotent: true, invoiceId: existingForPayment._id?.toString() };
    }

    const paymentAmount = roundMoney(Number(amount));
    let targetInvoice = null;

    // ── Step 1: Check if an existing invoice already exists for this subscription ──
    if (subscriptionId) {
      targetInvoice = await InvoiceModel.findOne({ subscriptionId }).sort({ createdAt: 1 }).exec();
    }

    if (targetInvoice) {
      // ── PATH A: Update existing subscription invoice (No duplicate invoice created) ──
      const currentPaid = roundMoney(Number(targetInvoice.amountPaid || 0));
      const newPaid = roundMoney(currentPaid + paymentAmount);
      const newDue = roundMoney(Math.max(0, targetInvoice.totalAmount - newPaid));
      const isPaid = newDue <= 0;

      targetInvoice.amountPaid = newPaid;
      targetInvoice.amountDue = newDue;
      targetInvoice.status = isPaid ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;
      if (isPaid) {
        targetInvoice.paidAt = new Date();
      }
      targetInvoice.pdfStatus = PdfStatus.PENDING;
      await targetInvoice.save();

      logger.info({
        msg: 'Existing invoice updated with payment',
        invoiceNumber: targetInvoice.invoiceNumber,
        newPaid,
        newDue,
        status: targetInvoice.status,
      });

      // Link payment to existing invoice
      try {
        await PaymentTransactionModel.findByIdAndUpdate(paymentId, {
          $set: { invoiceId: targetInvoice.invoiceNumber }
        }).exec();
      } catch (err) {
        logger.warn(`Could not link invoice to payment [${paymentId}]: ${err.message}`);
      }

      // Re-enqueue PDF generation to update PDF with new payment balance
      if (this.pdfQueueService) {
        await this.pdfQueueService.addPdfJob(targetInvoice._id.toString()).catch(() => { });
      }

      const invoiceObj = targetInvoice.toJSON ? targetInvoice.toJSON() : targetInvoice;
      await this.#deliverInvoice(invoiceObj, customer);

      return { success: true, invoiceId: targetInvoice._id.toString(), invoiceNumber: targetInvoice.invoiceNumber };
    }

    // ── PATH B: Create new single authoritative invoice ──
    let subDoc = null;
    if (subscriptionId) {
      subDoc = await ClientSubscriptionModel.findById(subscriptionId).populate('planId').lean().exec();
    }

    // Invoice total is the full subscription plan price (or payment amount if one-off)
    const planTotal = subDoc && subDoc.totalPlanPrice > 0
      ? roundMoney(subDoc.totalPlanPrice)
      : paymentAmount;

    const planGstRate = subDoc?.planId?.gstPercentage !== undefined
      ? Number(subDoc.planId.gstPercentage)
      : (subDoc?.gstPercentage !== undefined ? Number(subDoc.gstPercentage) : 0);

    const gst = extractGstFromInclusive(planTotal, planGstRate, false);
    const amountDue = roundMoney(Math.max(0, planTotal - paymentAmount));
    const invoiceStatus = amountDue <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;

    const seq = await getNextSequenceValue('invoiceNumber');
    const year = new Date().getFullYear();
    const invoiceNumber = `INV-${year}-${seq.toString().padStart(5, '0')}`;

    const description = planName
      ? `${planName} CCTV Security Subscription`
      : (subDoc?.packageTier ? `${subDoc.packageTier} Security Subscription Service` : 'CCTV Security Subscription');

    const invoiceData = {
      invoiceNumber,
      clientId,
      subscriptionId: subscriptionId || undefined,
      invoiceType: subscriptionId ? InvoiceType.RENEWAL : InvoiceType.NEW_PLAN,
      paymentTransactionId: paymentId,
      items: [
        {
          description,
          hsnSac: '998529',
          quantity: 1,
          unitPrice: gst.baseAmount,
          amount: gst.baseAmount,
        }
      ],
      currency: 'INR',
      subtotal: gst.baseAmount,
      taxPercentage: planGstRate,
      taxAmount: gst.gstAmount,
      cgstAmount: gst.cgstAmount,
      sgstAmount: gst.sgstAmount,
      igstAmount: 0,
      totalAmount: gst.totalAmount,
      amountPaid: paymentAmount,
      amountDue,
      status: invoiceStatus,
      paidAt: amountDue <= 0 ? new Date() : null,
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      pdfUrl: null,
      pdfStatus: PdfStatus.PENDING,
      notes: sessionId ? `Checkout Session: ${sessionId}` : ''
    };

    const invoice = await InvoiceModel.create(invoiceData);
    const invoiceId = invoice._id?.toString() || invoice.id;

    logger.info({
      msg: 'Single authoritative invoice created',
      invoiceNumber,
      paymentId,
      totalAmount: gst.totalAmount,
      amountPaid: paymentAmount,
      amountDue,
      status: invoiceStatus,
    });

    // Link invoice to payment transaction
    try {
      await PaymentTransactionModel.findByIdAndUpdate(paymentId, {
        $set: { invoiceId: invoiceNumber }
      }).exec();
    } catch (err) {
      logger.warn(`Could not link invoice to payment [${paymentId}]: ${err.message}`);
    }

    // Enqueue PDF generation
    if (this.pdfQueueService) {
      await this.pdfQueueService.addPdfJob(invoiceId);
    }

    const invoiceObj = invoice.toJSON ? invoice.toJSON() : invoice;
    await this.#deliverInvoice(invoiceObj, customer, clientId);

    return { success: true, invoiceId, invoiceNumber };
  }

  /**
   * Deliver invoice via Email
   */
  async #deliverInvoice(invoice, customer = {}, clientId = null) {
    try {
      let recipientEmail = customer?.email;
      if (!recipientEmail && (clientId || invoice.clientId)) {
        const clientDoc = await ClientModel.findById(clientId || invoice.clientId).lean().exec();
        recipientEmail = clientDoc?.email;
      }
      if (recipientEmail) {
        await sendInvoiceEmail({
          to: recipientEmail,
          client: customer,
          invoice,
          pdfUrl: invoice.pdfUrl || null,
        });
      }
    } catch (err) {
      logger.error(`Post-payment invoice email delivery failed: ${err.message}`);
    }
  }

  async close() {
    await this.adminWorker.close();
    await this.invoiceWorker.close();
  }
}
