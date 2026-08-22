import { BaseController } from '../../shared/bases/base.controller.js';
import { Messages } from '../../shared/constants/messages.constant.js';

export class InvoiceController extends BaseController {
  constructor({ invoiceService }) {
    super();
    this.invoiceService = invoiceService;
  }

  createInvoice = this.catchAsync(async (req, res) => {
    const invoice = await this.invoiceService.createInvoice({
      ...req.body,
      createdBy: req.user?.id
    });
    return this.sendCreated(res, invoice, 'Invoice generated successfully');
  });

  getInvoiceById = this.catchAsync(async (req, res) => {
    const invoice = await this.invoiceService.getInvoiceById(req.params.id);
    return this.sendResponse(res, invoice, Messages.FETCHED);
  });

  listInvoices = this.catchAsync(async (req, res) => {
    const { items, page, limit, total } = await this.invoiceService.listInvoices(req.query);
    return this.sendPaginated(res, items, page, limit, total, Messages.FETCHED);
  });

  getInvoicePdfStatus = this.catchAsync(async (req, res) => {
    const status = await this.invoiceService.getInvoicePdfStatus(req.params.id);
    return this.sendResponse(res, status, 'Invoice PDF status fetched');
  });

  downloadInvoicePdf = this.catchAsync(async (req, res) => {
    const invoice = await this.invoiceService.getInvoiceById(req.params.id);
    if (!invoice) {
      return this.sendNotFound(res, 'Invoice not found');
    }

    let finalPdfUrl = invoice.pdfUrl;

    // If PDF is pending or fresh query passed, compile on-demand
    if (!finalPdfUrl || invoice.pdfStatus === 'PENDING' || req.query.fresh === 'true') {
      const ensured = await this.invoiceService.ensureInvoicePdfFile(req.params.id, true);
      finalPdfUrl = ensured?.pdfUrl || finalPdfUrl;
    }

    if (finalPdfUrl && finalPdfUrl.startsWith('http')) {
      // Append cache-busting timestamp so browser/CDN never shows an outdated PDF
      const separator = finalPdfUrl.includes('?') ? '&' : '?';
      const version = invoice.updatedAt ? new Date(invoice.updatedAt).getTime() : Date.now();
      return res.redirect(`${finalPdfUrl}${separator}v=${version}`);
    }

    return this.sendNotFound(res, 'Invoice PDF is still generating. Please try again shortly.');
  });

  emailInvoice = this.catchAsync(async (req, res) => {
    const result = await this.invoiceService.emailInvoice(req.params.id);
    return this.sendResponse(res, result, result.message);
  });

  updateInvoiceStatus = this.catchAsync(async (req, res) => {
    const invoice = await this.invoiceService.updateInvoiceStatus(req.params.id, req.body);
    return this.sendResponse(res, invoice, 'Invoice status updated successfully');
  });

  recordInvoicePayment = this.catchAsync(async (req, res) => {
    const invoice = await this.invoiceService.recordInvoicePayment(req.params.id, req.body);
    return this.sendResponse(res, invoice, 'Payment recorded successfully');
  });
}
