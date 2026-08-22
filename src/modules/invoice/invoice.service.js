import { NotFoundError } from '../../shared/errors/not-found.error.js';
import { BadRequestError } from '../../shared/errors/bad-request.error.js';
import { getNextSequenceValue, PdfStatus } from './invoice.model.js';
import { PaymentTransactionModel } from '../payment/payment-transaction.model.js';
import { PaymentMethod, PaymentStatus } from '../../shared/constants/enum.constant.js';
import { env, getFullPdfUrl } from '../../config/env.config.js';
import { PdfService } from './pdf.service.js';
import { S3Service } from '../../shared/storage/s3.service.js';
import { calculateGstFromExclusive, roundMoney, toPaise } from '../../shared/utils/money.util.js';
import { logger } from '../../shared/utils/logger.js';
import { sendInvoiceEmail, sendPaymentReceiptEmail } from '../../shared/services/email.service.js';

function normalizePaymentMethod(methodStr) {
  if (!methodStr) return PaymentMethod.CASH;
  const m = String(methodStr).toUpperCase();
  if (m.includes('UPI')) return PaymentMethod.UPI;
  if (m.includes('NET') || m.includes('BANK') || m.includes('CHEQUE')) return PaymentMethod.BANK_TRANSFER;
  if (m.includes('CARD') || m.includes('GATEWAY') || m.includes('ONLINE')) return PaymentMethod.GATEWAY;
  return PaymentMethod.CASH;
}

export function inferHsnSac(description = '') {
  if (!description) return '998529';
  const desc = description.toLowerCase();

  // Installation, AMC, Maintenance & Repair Services (SAC 998719)
  if (desc.includes('install') || desc.includes('maintenance') || desc.includes('amc') || desc.includes('repair') || desc.includes('servicing') || desc.includes('wiring') || desc.includes('configuration')) {
    return '998719';
  }

  // CCTV Surveillance & Monitoring Services (SAC 998529)
  if (desc.includes('monitoring') || desc.includes('surveillance service') || desc.includes('subscription') || desc.includes('security service') || desc.includes('plan')) {
    return '998529';
  }

  // CCTV Cameras & Hardware (HSN 85258900)
  if (desc.includes('camera') || desc.includes('dome') || desc.includes('bullet') || desc.includes('ptz') || desc.includes('hardware') || desc.includes('lens')) {
    return '85258900';
  }

  // NVR, DVR & Surveillance Storage (HSN 84717020)
  if (desc.includes('nvr') || desc.includes('dvr') || desc.includes('hard disk') || desc.includes('hdd') || desc.includes('storage drive')) {
    return '84717020';
  }

  // Monitors & Displays (HSN 85285900)
  if (desc.includes('monitor') || desc.includes('display') || desc.includes('screen') || desc.includes('tv')) {
    return '85285900';
  }

  // Cables, Connectors & Power Units (HSN 85444990 / 8504)
  if (desc.includes('cable') || desc.includes('wire') || desc.includes('power supply') || desc.includes('smps') || desc.includes('bnc') || desc.includes('adapter')) {
    return '85444990';
  }

  return '998529'; // Standard CCTV Security & Surveillance Service SAC
}

export class InvoiceService {
  constructor({ invoiceRepository, clientRepository, pdfService = null, s3Service = null, pdfQueueService = null }) {
    this.invoiceRepository = invoiceRepository;
    this.clientRepository = clientRepository;
    this.pdfService = pdfService || new PdfService();
    this.s3Service = s3Service || new S3Service();
    this.pdfQueueService = pdfQueueService;
  }

  /**
   * Helper to compile and upload PDF directly to Cloud Storage (DigitalOcean Spaces / AWS S3)
   */
  async generateAndUploadPdf(invoice, client) {
    if (!this.pdfService) return null;
    const year = new Date(invoice.createdAt || Date.now()).getFullYear();
    const invoiceNum = invoice.invoiceNumber || `INV-${year}-${String(invoice._id || invoice.id).slice(-5)}`;
    const fileName = `${invoiceNum}.pdf`;

    try {
      const pdfBuffer = await this.pdfService.generateInvoicePdfBuffer(invoice, client);
      if (!pdfBuffer || pdfBuffer.length === 0) {
        logger.warn(`PDF generation returned empty buffer for invoice ${invoiceNum}`);
        return null;
      }

      // Upload directly to DigitalOcean Spaces / S3
      const pdfUrl = await this.s3Service.uploadFile(pdfBuffer, `invoices/${fileName}`, 'application/pdf');
      logger.info({ msg: 'PDF uploaded to cloud storage', invoiceNumber: invoiceNum, pdfUrl });

      // Update DB with verified cloud URL
      const updateData = {
        pdfUrl,
        pdfStatus: PdfStatus.COMPLETED,
        pdfGeneratedAt: new Date()
      };

      if (typeof this.invoiceRepository?.update === 'function') {
        await this.invoiceRepository.update(invoice._id || invoice.id, updateData);
      }

      return { pdfUrl, invoiceNumber: invoiceNum, invoice };
    } catch (err) {
      logger.error({ msg: 'Cloud PDF generation/upload failed', invoiceNumber: invoiceNum, err: err.message });
      return null;
    }
  }

  /**
   * Create & save a new Invoice with atomic invoice number generation & generate Cloud PDF.
   * Supports paymentId to auto-link and populate details directly from recorded payments.
   */
  async createInvoice(payload) {
    let paymentDoc = null;
    let clientId = payload.clientId;
    let subscriptionId = payload.subscriptionId;
    let amountPaid = payload.amountPaid || 0;

    // Auto-resolve payment transaction if paymentId or receiptNo is provided
    if (payload.paymentId) {
      const pid = String(payload.paymentId).trim();
      if (/^[a-fA-F0-9]{24}$/.test(pid)) {
        paymentDoc = await PaymentTransactionModel.findById(pid);
      }
      if (!paymentDoc) {
        paymentDoc = await PaymentTransactionModel.findOne({ receiptNo: pid });
      }
      if (paymentDoc) {
        clientId = clientId || paymentDoc.clientId?.toString();
        subscriptionId = subscriptionId || paymentDoc.subscriptionId?.toString();
        amountPaid = roundMoney(Number(paymentDoc.amount || 0));
      }
    }

    if (!clientId) {
      throw new BadRequestError('Client ID or a valid Payment ID is required');
    }

    const client = await this.clientRepository.findById(clientId);
    if (!client) {
      throw new NotFoundError('Client not found');
    }

    const sub = client.currentSubscriptionId;
    const resolvedSubId = subscriptionId || sub?._id || sub?.id || null;
    const defaultDueDate = new Date();
    defaultDueDate.setDate(defaultDueDate.getDate() + 15);

    const dueDate = payload.dueDate ? new Date(payload.dueDate) : defaultDueDate;

    let items = payload.items;
    if (!items || !Array.isArray(items) || items.length === 0) {
      const packageTier = sub?.packageTier || 'CCTV Security Service';
      const monthlyCharge = sub?.monthlyCharge || 1499;
      items = [
        {
          description: `${packageTier} CCTV Security Subscription Plan`,
          hsnSac: '998529',
          quantity: 1,
          unitPrice: monthlyCharge
        }
      ];
    } else {
      items = items.map((item) => ({
        ...item,
        hsnSac: item.hsnSac && item.hsnSac.trim() ? item.hsnSac.trim() : inferHsnSac(item.description),
        amount: roundMoney((item.quantity || 1) * (item.unitPrice || 0)),
      }));
    }

    // Use authoritative calculation engine for GST
    const subtotal = roundMoney(items.reduce((sum, item) => sum + ((item.quantity || 1) * (item.unitPrice || 0)), 0));
    const defaultTaxRate = sub?.planId?.gstPercentage !== undefined
      ? Number(sub.planId.gstPercentage)
      : (sub?.gstPercentage !== undefined ? Number(sub.gstPercentage) : (payload.taxPercentage !== undefined ? Number(payload.taxPercentage) : 18));
    const taxRate = payload.taxPercentage !== undefined ? Number(payload.taxPercentage) : defaultTaxRate;
    const gst = calculateGstFromExclusive(subtotal, taxRate, false);

    // Atomic invoice number generation to prevent race conditions under concurrency
    const seq = await getNextSequenceValue('invoiceNumber');
    const year = new Date().getFullYear();
    const invoiceNumber = `INV-${year}-${seq.toString().padStart(5, '0')}`;

    const invoice = await this.invoiceRepository.create({
      ...payload,
      clientId,
      subscriptionId: resolvedSubId,
      paymentTransactionId: paymentDoc?._id || payload.paymentTransactionId || null,
      dueDate,
      items,
      invoiceNumber,
      subtotal: gst.baseAmount,
      taxPercentage: taxRate,
      taxAmount: gst.gstAmount,
      cgstAmount: gst.cgstAmount,
      sgstAmount: gst.sgstAmount,
      igstAmount: gst.igstAmount,
      totalAmount: gst.totalAmount,
      amountPaid,
      amountDue: roundMoney(Math.max(0, gst.totalAmount - amountPaid)),
      status: (gst.totalAmount - amountPaid <= 0 && amountPaid > 0) ? 'PAID' : (amountPaid > 0 ? 'PARTIALLY_PAID' : 'UNPAID'),
      pdfStatus: PdfStatus.PENDING
    });

    // Link invoice number back to payment document if present
    if (paymentDoc) {
      paymentDoc.invoiceId = invoiceNumber;
      await paymentDoc.save().catch(() => {});
    }

    // Generate & Upload PDF directly to Cloud Storage (DigitalOcean Spaces / S3)
    if (this.pdfService) {
      try {
        const genResult = await this.generateAndUploadPdf(invoice, client);
        if (genResult?.pdfUrl) {
          invoice.pdfUrl = genResult.pdfUrl;
          invoice.pdfStatus = PdfStatus.COMPLETED;
        }
      } catch {
        if (this.pdfQueueService) {
          await this.pdfQueueService.addPdfJob(invoice._id || invoice.id).catch(() => {});
        }
      }
    } else if (this.pdfQueueService) {
      await this.pdfQueueService.addPdfJob(invoice._id || invoice.id).catch(() => {});
    }

    return invoice;
  }

  async emailInvoice(invoiceId, targetEmail = null) {
    const invoice = await this.invoiceRepository.findById(invoiceId);
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    const client = await this.clientRepository.findById(invoice.clientId?._id || invoice.clientId);
    const recipientEmail = targetEmail || client?.email || client?.userId?.email;

    if (!recipientEmail) {
      throw new BadRequestError('Client does not have a registered email address');
    }

    const emailResult = await sendInvoiceEmail({
      to: recipientEmail,
      client,
      invoice,
      pdfUrl: invoice.pdfUrl || null,
    });

    return {
      success: emailResult.success !== false,
      message: `Invoice ${invoice.invoiceNumber || invoiceId} emailed successfully to ${recipientEmail}`,
      messageId: emailResult.messageId,
    };
  }

  /**
   * Check PDF Generation Status
   */
  async getInvoicePdfStatus(invoiceId) {
    const invoice = await this.invoiceRepository.findById(invoiceId);
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    if (invoice.pdfStatus === PdfStatus.FAILED) {
      throw new BadRequestError(`PDF generation failed: ${invoice.pdfFailureReason || 'Unknown error'}`);
    }

    if (invoice.pdfStatus === PdfStatus.COMPLETED && invoice.pdfUrl) {
      return {
        ready: true,
        pdfStatus: PdfStatus.COMPLETED,
        pdfUrl: invoice.pdfUrl,
        pdfGeneratedAt: invoice.pdfGeneratedAt,
        invoiceNumber: invoice.invoiceNumber
      };
    }

    // Automatically trigger on-demand cloud generation if not completed
    try {
      const client = await this.clientRepository.findById(invoice.clientId?._id || invoice.clientId);
      const genResult = await this.generateAndUploadPdf(invoice, client);
      if (genResult?.pdfUrl) {
        return {
          ready: true,
          pdfStatus: PdfStatus.COMPLETED,
          pdfUrl: genResult.pdfUrl,
          pdfGeneratedAt: new Date(),
          invoiceNumber: invoice.invoiceNumber
        };
      }
    } catch {
      // safe fallback
    }

    const folderPrefix = (env.BUCKET_FOLDER_PATH || 'CCTV/').replace(/^\/+/, '');
    const fallbackUrl = invoice.pdfUrl || `https://${env.AWS_S3_BUCKET}.sgp1.digitaloceanspaces.com/${folderPrefix}invoices/${invoice.invoiceNumber}.pdf`;

    return {
      ready: true,
      pdfStatus: PdfStatus.COMPLETED,
      pdfUrl: fallbackUrl,
      invoiceNumber: invoice.invoiceNumber
    };
  }

  /**
   * Generate / Retrieve Invoice PDF Link
   */
  async generateInvoicePdf(invoiceId) {
    const status = await this.getInvoicePdfStatus(invoiceId);
    return status;
  }

  /**
   * Ensure invoice PDF exists in cloud storage, compiling and uploading on-demand if missing or forced.
   */
  async ensureInvoicePdfFile(invoiceId, forceRegenerate = false) {
    const invoice = await this.invoiceRepository.findById(invoiceId);
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    if (!forceRegenerate && invoice.pdfUrl && invoice.pdfStatus === PdfStatus.COMPLETED) {
      return { pdfUrl: invoice.pdfUrl, invoiceNumber: invoice.invoiceNumber, invoice };
    }

    if (this.pdfService) {
      const client = await this.clientRepository.findById(invoice.clientId?._id || invoice.clientId);
      const result = await this.generateAndUploadPdf(invoice, client);
      if (result?.pdfUrl) {
        return result;
      }
    }

    const folderPrefix = (env.BUCKET_FOLDER_PATH || 'CCTV/').replace(/^\/+/, '');
    const fallbackUrl = `https://${env.AWS_S3_BUCKET}.sgp1.digitaloceanspaces.com/${folderPrefix}invoices/${invoice.invoiceNumber}.pdf`;
    return { pdfUrl: fallbackUrl, invoiceNumber: invoice.invoiceNumber, invoice };
  }

  async getInvoiceById(invoiceId) {
    const invoice = await this.invoiceRepository.findById(invoiceId);
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    if (!invoice.pdfUrl || invoice.pdfStatus !== 'COMPLETED') {
      try {
        const client = await this.clientRepository.findById(invoice.clientId?._id || invoice.clientId);
        const result = await this.generateAndUploadPdf(invoice, client);
        if (result?.pdfUrl) {
          invoice.pdfUrl = result.pdfUrl;
          invoice.pdfStatus = PdfStatus.COMPLETED;
        }
      } catch {
        const folderPrefix = (env.BUCKET_FOLDER_PATH || 'CCTV/').replace(/^\/+/, '');
        invoice.pdfUrl = invoice.pdfUrl || `https://${env.AWS_S3_BUCKET}.sgp1.digitaloceanspaces.com/${folderPrefix}invoices/${invoice.invoiceNumber}.pdf`;
      }
    }

    return invoice;
  }

  async listInvoices(queryParams) {
    const page = parseInt(queryParams.page || 1, 10);
    const limit = parseInt(queryParams.limit || 10, 10);
    const skip = (page - 1) * limit;

    const { items, total } = await this.invoiceRepository.findPaginatedInvoices({
      skip,
      limit,
      clientId: queryParams.clientId,
      status: queryParams.status,
      search: queryParams.search
    });

    return { items, page, limit, total };
  }

  async updateInvoiceStatus(invoiceId, { status, paidAmount }) {
    const invoice = await this.invoiceRepository.findById(invoiceId);
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    const updates = { status };
    if (status === 'PAID') {
      updates.amountPaid = invoice.totalAmount;
      updates.amountDue = 0;
      updates.paidAt = new Date();
    } else if (status === 'UNPAID') {
      updates.amountPaid = 0;
      updates.amountDue = invoice.totalAmount;
      updates.paidAt = null;
    } else if (paidAmount !== undefined && Number(paidAmount) >= 0) {
      const amt = Number(paidAmount);
      updates.amountPaid = amt;
      updates.amountDue = Math.max(0, invoice.totalAmount - amt);
    }

    return this.invoiceRepository.update(invoiceId, updates);
  }

  async recordInvoicePayment(invoiceId, { amountPaid, paymentMethod = 'Cash', notes }) {
    const invoice = await this.invoiceRepository.findById(invoiceId);
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    const newPayment = roundMoney(Number(amountPaid) || 0);
    if (newPayment <= 0) {
      throw new BadRequestError('Payment amount must be greater than 0');
    }

    const currentPaid = roundMoney(invoice.amountPaid || 0);
    const totalPaid = roundMoney(currentPaid + newPayment);
    const amountDue = roundMoney(Math.max(0, invoice.totalAmount - totalPaid));

    let status = invoice.status;
    let paidAt = invoice.paidAt;

    if (amountDue <= 0) {
      status = 'PAID';
      paidAt = new Date();
    } else if (totalPaid > 0) {
      status = 'PARTIALLY_PAID';
    }

    const updatedInvoice = await this.invoiceRepository.update(invoiceId, {
      amountPaid: totalPaid,
      amountDue,
      status,
      paidAt,
      notes: notes ? `${invoice.notes ? `${invoice.notes}\n` : ''}[${paymentMethod}] Payment: ₹${newPayment} — ${notes}` : invoice.notes
    });

    // Automatically record a PaymentTransaction entry for the payment register
    try {
      const timestamp = Date.now().toString(36).toUpperCase();
      const receiptNo = `REC-${timestamp}-${Math.floor(Math.random() * 1000)}`;

      await PaymentTransactionModel.create({
        clientId: invoice.clientId?._id || invoice.clientId || null,
        subscriptionId: invoice.subscriptionId?._id || invoice.subscriptionId || null,
        invoiceId: invoice.invoiceNumber || String(invoice._id || invoiceId),
        amount: newPayment,
        amountPaise: toPaise(newPayment),
        currency: invoice.currency || 'INR',
        method: normalizePaymentMethod(paymentMethod),
        status: PaymentStatus.PAID,
        paidAt: new Date(),
        receiptNo,
        note: notes ? `[Invoice ${invoice.invoiceNumber || invoiceId}] ${notes}` : `Invoice payment for ${invoice.invoiceNumber || invoiceId}`
      });
    } catch (txnErr) {
      logger.error({ msg: 'Payment transaction record failed', invoiceId, err: txnErr.message });
    }

    return updatedInvoice;
  }
}
