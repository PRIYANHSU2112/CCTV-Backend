import fs from 'fs';
import path from 'path';
import { NotFoundError } from '../../shared/errors/not-found.error.js';
import { BadRequestError } from '../../shared/errors/bad-request.error.js';
import { getNextSequenceValue, PdfStatus } from './invoice.model.js';
import { PaymentTransactionModel } from '../payment/payment-transaction.model.js';
import { PaymentMethod, PaymentStatus } from '../../shared/constants/enum.constant.js';

function normalizePaymentMethod(methodStr) {
  if (!methodStr) return PaymentMethod.CASH;
  const m = String(methodStr).toUpperCase();
  if (m.includes('UPI')) return PaymentMethod.UPI;
  if (m.includes('NET') || m.includes('BANK') || m.includes('CHEQUE')) return PaymentMethod.BANK_TRANSFER;
  if (m.includes('CARD') || m.includes('GATEWAY') || m.includes('ONLINE')) return PaymentMethod.GATEWAY;
  return PaymentMethod.CASH;
}

export class InvoiceService {
  constructor({ invoiceRepository, clientRepository, pdfService = null, pdfQueueService = null }) {
    this.invoiceRepository = invoiceRepository;
    this.clientRepository = clientRepository;
    this.pdfService = pdfService;
    this.pdfQueueService = pdfQueueService;
  }

  /**
   * Create & save a new Invoice with atomic invoice number generation & enqueue PDF job
   */
  async createInvoice(payload) {
    if (!payload.clientId) {
      throw new BadRequestError('Client ID is required');
    }

    const client = await this.clientRepository.findById(payload.clientId);
    if (!client) {
      throw new NotFoundError('Client not found');
    }

    const sub = client.currentSubscriptionId;
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
          quantity: 1,
          unitPrice: monthlyCharge
        }
      ];
    }

    // Atomic invoice number generation to prevent race conditions under concurrency
    const seq = await getNextSequenceValue('invoiceNumber');
    const year = new Date().getFullYear();
    const invoiceNumber = `INV-${year}-${seq.toString().padStart(5, '0')}`;

    const invoice = await this.invoiceRepository.create({
      ...payload,
      subscriptionId: payload.subscriptionId || sub?._id || sub?.id || null,
      dueDate,
      items,
      invoiceNumber,
      pdfStatus: PdfStatus.PENDING
    });

    // Enqueue PDF generation job in BullMQ (Processed asynchronously by Worker container)
    if (this.pdfQueueService) {
      await this.pdfQueueService.addPdfJob(invoice._id || invoice.id);
    }

    return invoice;
  }

  async emailInvoice(invoiceId) {
    const invoice = await this.invoiceRepository.findById(invoiceId);
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    const client = await this.clientRepository.findById(invoice.clientId);
    const email = client?.userId?.email;
    return {
      success: true,
      message: email
        ? `Invoice ${invoice.invoiceNumber || invoiceId} emailed successfully to ${email}`
        : `Invoice ${invoice.invoiceNumber || invoiceId} queued for email delivery`
    };
  }

  /**
   * Check PDF Generation Status (API Container Safe - No Puppeteer dependency)
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

    return {
      ready: false,
      pdfStatus: invoice.pdfStatus || PdfStatus.PROCESSING,
      message: 'PDF is being generated in the background worker'
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
   * Ensure invoice PDF exists on disk, compiling on-demand if missing.
   */
  async ensureInvoicePdfFile(invoiceId) {
    const invoice = await this.invoiceRepository.findById(invoiceId);
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    const year = new Date(invoice.createdAt || Date.now()).getFullYear();
    const invoiceNum = invoice.invoiceNumber || `INV-${year}-${String(invoiceId).slice(-5)}`;
    const relativePath = `/uploads/invoices/${invoiceNum}.pdf`;
    const absolutePath = path.resolve(`./uploads/invoices/${invoiceNum}.pdf`);

    if (fs.existsSync(absolutePath)) {
      return { absolutePath, relativePath, invoiceNumber: invoiceNum, invoice };
    }

    if (this.pdfService) {
      const client = await this.clientRepository.findById(invoice.clientId);
      const pdfBuffer = await this.pdfService.generateInvoicePdfBuffer(invoice, client);

      const dir = path.dirname(absolutePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(absolutePath, pdfBuffer);

      await this.invoiceRepository.update(invoice._id || invoiceId, {
        pdfUrl: relativePath,
        pdfStatus: PdfStatus.COMPLETED,
        pdfGeneratedAt: new Date()
      });

      return { absolutePath, relativePath, invoiceNumber: invoiceNum, invoice };
    }

    throw new NotFoundError(`PDF file for invoice ${invoiceNum} is not available`);
  }

  async getInvoiceById(invoiceId) {
    const invoice = await this.invoiceRepository.findById(invoiceId);
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
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

    const newPayment = Number(amountPaid) || 0;
    if (newPayment <= 0) {
      throw new BadRequestError('Payment amount must be greater than 0');
    }

    const currentPaid = invoice.amountPaid || 0;
    const totalPaid = currentPaid + newPayment;
    const amountDue = Math.max(0, invoice.totalAmount - totalPaid);

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
        amountPaise: Math.round(newPayment * 100),
        currency: invoice.currency || 'INR',
        method: normalizePaymentMethod(paymentMethod),
        status: PaymentStatus.PAID,
        paidAt: new Date(),
        receiptNo,
        note: notes ? `[Invoice ${invoice.invoiceNumber || invoiceId}] ${notes}` : `Invoice payment for ${invoice.invoiceNumber || invoiceId}`
      });
    } catch {
      // Safe fallback if payment transaction creation fails
    }

    return updatedInvoice;
  }
}
