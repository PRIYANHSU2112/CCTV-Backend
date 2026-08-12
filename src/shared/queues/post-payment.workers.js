import { ADMIN_NOTIFICATION_QUEUE, INVOICE_PIPELINE_QUEUE } from './post-payment-queue.service.js';
import { NotificationModel } from '../../modules/notification/notification.model.js';
import { InvoiceModel, InvoiceStatus, PdfStatus, getNextSequenceValue } from '../../modules/invoice/invoice.model.js';
import { PaymentTransactionModel } from '../../modules/payment/payment-transaction.model.js';
import { UserModel } from '../../modules/user/user.model.js';
import { env } from '../../config/env.config.js';
import { logger } from '../utils/logger.js';

let Worker = null;
try {
  const bullmq = await import('bullmq');
  Worker = bullmq.Worker || bullmq.default?.Worker;
} catch (err) {
  logger.warn('⚠️ [BullMQ Worker] Module loading failed or missing in environment.');
}

/**
 * Placeholder: Send invoice via Email
 * Replace with Nodemailer / SendGrid / Resend integration
 */
async function sendInvoiceEmail({ customerEmail, customerName, invoiceNumber, pdfUrl }) {
  logger.info(`📧 [EMAIL STUB] Sending invoice ${invoiceNumber} to ${customerEmail || customerName} | PDF: ${pdfUrl || 'pending'}`);
  // TODO: Integrate real email service
  return { sent: true, channel: 'email' };
}

/**
 * Placeholder: Send invoice via WhatsApp
 * Replace with Twilio / WhatsApp Business API integration
 */
async function sendInvoiceWhatsApp({ customerPhone, customerName, invoiceNumber, pdfUrl }) {
  logger.info(`📱 [WHATSAPP STUB] Sending invoice ${invoiceNumber} to ${customerPhone || customerName} | PDF: ${pdfUrl || 'pending'}`);
  // TODO: Integrate real WhatsApp API
  return { sent: true, channel: 'whatsapp' };
}

/**
 * Post-Payment Background Workers
 *
 * Initializes two independent BullMQ workers:
 * 1. AdminNotificationWorker — creates in-app notification for admin users
 * 2. InvoicePipelineWorker — generates invoice → saves to DB → triggers PDF → sends email/WhatsApp
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

    // Find all admin/super-admin users to notify
    const admins = await UserModel.find({
      role: { $in: ['SUPER_ADMIN', 'ACCOUNTS_MANAGER'] },
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
   * Worker 2: Invoice Pipeline — Generate → Save → PDF → Email + WhatsApp
   */
  async processInvoicePipeline(job) {
    const { paymentId, clientId, subscriptionId, amount, planName, sessionId, customer } = job.data;
    logger.info(`⚙️ Processing Invoice Pipeline for Payment [${paymentId}]`);

    // ── Step 0: Idempotency check — skip if invoice already exists for this payment ──
    const existingInvoice = await InvoiceModel.findOne({ paymentTransactionId: paymentId }).lean().exec();
    if (existingInvoice) {
      logger.info(`📋 Invoice already exists for payment [${paymentId}]: ${existingInvoice.invoiceNumber}. Skipping creation.`);
      // Still attempt delivery if PDF is ready
      if (existingInvoice.pdfStatus === 'COMPLETED' && existingInvoice.pdfUrl) {
        await this.#deliverInvoice(existingInvoice, customer);
      }
      return { idempotent: true, invoiceId: existingInvoice._id?.toString() };
    }

    // ── Step 1: Generate atomic invoice number ──
    const seq = await getNextSequenceValue('invoiceNumber');
    const year = new Date().getFullYear();
    const invoiceNumber = `INV-${year}-${seq.toString().padStart(5, '0')}`;

    // ── Step 2: Create invoice document ──
    let pdfUrl = `/uploads/invoices/${invoiceNumber}.pdf`;
    if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
      if (env.AWS_ENDPOINT && env.AWS_ENDPOINT.includes('digitaloceanspaces.com')) {
        const cleanEndpoint = env.AWS_ENDPOINT.replace(/^https?:\/\//, '').replace(/\/$/, '');
        pdfUrl = `https://${env.AWS_S3_BUCKET}.${cleanEndpoint}/invoices/${invoiceNumber}.pdf`;
      } else {
        pdfUrl = `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/invoices/${invoiceNumber}.pdf`;
      }
    }

    const invoiceData = {
      invoiceNumber,
      clientId,
      subscriptionId: subscriptionId || undefined,
      invoiceType: subscriptionId ? 'RENEWAL' : 'NEW_PLAN',
      paymentTransactionId: paymentId,
      items: [
        {
          description: planName ? `CCTV Subscription — ${planName}` : 'CCTV Subscription Payment',
          quantity: 1,
          unitPrice: Number(amount),
          amount: Number(amount)
        }
      ],
      currency: 'INR',
      subtotal: Number(amount),
      taxPercentage: 18,
      status: InvoiceStatus.PAID,
      paidAt: new Date(),
      issueDate: new Date(),
      dueDate: new Date(), // Already paid
      pdfUrl,
      pdfStatus: PdfStatus.COMPLETED,
      pdfGeneratedAt: new Date(),
      notes: sessionId ? `Checkout Session: ${sessionId}` : ''
    };

    const invoice = await InvoiceModel.create(invoiceData);
    const invoiceId = invoice._id?.toString() || invoice.id;
    logger.info(`📋 Invoice Created with PDF URL [${pdfUrl}]: [${invoiceNumber}] for payment [${paymentId}]`);

    // ── Step 3: Link invoice back to payment transaction ──
    try {
      await PaymentTransactionModel.findByIdAndUpdate(paymentId, {
        $set: { invoiceId: invoiceNumber }
      }).exec();
    } catch (err) {
      logger.warn(`Could not link invoice to payment [${paymentId}]: ${err.message}`);
    }

    // ── Step 4: Enqueue PDF generation via existing pdf-generation-queue ──
    if (this.pdfQueueService) {
      await this.pdfQueueService.addPdfJob(invoiceId);
      logger.info(`📄 PDF Generation Job Enqueued for Invoice [${invoiceId}]`);
    }

    // ── Step 5: Attempt delivery (email + WhatsApp) ──
    // PDF may not be ready yet — delivery stubs log the intent
    const invoiceObj = invoice.toJSON ? invoice.toJSON() : invoice;
    await this.#deliverInvoice(invoiceObj, customer);

    return { success: true, invoiceId, invoiceNumber };
  }

  /**
   * Deliver invoice via Email and WhatsApp (placeholder stubs)
   */
  async #deliverInvoice(invoice, customer = {}) {
    const deliveryPromises = [];

    deliveryPromises.push(
      sendInvoiceEmail({
        customerEmail: customer?.email,
        customerName: customer?.name || 'Customer',
        invoiceNumber: invoice.invoiceNumber,
        pdfUrl: invoice.pdfUrl || null
      }).catch(err => logger.error(`Email delivery failed: ${err.message}`))
    );

    deliveryPromises.push(
      sendInvoiceWhatsApp({
        customerPhone: customer?.phone,
        customerName: customer?.name || 'Customer',
        invoiceNumber: invoice.invoiceNumber,
        pdfUrl: invoice.pdfUrl || null
      }).catch(err => logger.error(`WhatsApp delivery failed: ${err.message}`))
    );

    await Promise.allSettled(deliveryPromises);
    logger.info(`📨 Invoice delivery dispatched for [${invoice.invoiceNumber}]`);
  }

  async close() {
    await this.adminWorker.close();
    await this.invoiceWorker.close();
  }
}
