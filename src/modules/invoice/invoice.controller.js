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

    // If PDF already exists in database, return/redirect directly
    if (invoice.pdfUrl && invoice.pdfUrl.startsWith('http') && req.query.fresh !== 'true') {
      return res.redirect(invoice.pdfUrl);
    }

    let finalPdfUrl = invoice.pdfUrl;

    // Only compile on-demand if pdfUrl is missing or forced
    if (!finalPdfUrl || invoice.pdfStatus === 'PENDING' || req.query.fresh === 'true') {
      const ensured = await this.invoiceService.ensureInvoicePdfFile(req.params.id, req.query.fresh === 'true');
      finalPdfUrl = ensured?.pdfUrl || finalPdfUrl;
    }

    if (finalPdfUrl && finalPdfUrl.startsWith('http')) {
      return res.redirect(finalPdfUrl);
    }

    return this.sendNotFound(res, 'Invoice PDF is still generating. Please try again shortly.');
  });

  emailInvoice = this.catchAsync(async (req, res) => {
    const targetEmail = req.body?.targetEmail || req.body?.email || null;
    const result = await this.invoiceService.emailInvoice(req.params.id, targetEmail);
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
