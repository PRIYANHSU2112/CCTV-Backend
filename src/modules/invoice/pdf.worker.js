import { PDF_QUEUE_NAME } from './pdf-queue.service.js';
import { InvoiceModel, PdfStatus } from './invoice.model.js';
import { S3Service } from '../../shared/storage/s3.service.js';
import { logger } from '../../shared/utils/logger.js';

let Worker = null;
try {
  const bullmq = await import('bullmq');
  Worker = bullmq.Worker || bullmq.default?.Worker;
} catch (err) {
  logger.warn('⚠️ [BullMQ PDF Worker] Module loading failed or missing in environment.');
}

export class PdfWorker {
  constructor({ redisClient, clientRepository, pdfService, s3Service = null }) {
    this.clientRepository = clientRepository;
    this.pdfService = pdfService;
    this.s3Service = s3Service || new S3Service();

    if (!Worker) {
      logger.warn('⚠️ PdfWorker disabled because BullMQ Worker module is missing.');
      return;
    }

    const connection = redisClient.duplicate
      ? redisClient.duplicate({ maxRetriesPerRequest: null, enableOfflineQueue: true })
      : { host: process.env.REDIS_HOST || 'redis', port: Number(process.env.REDIS_PORT || 6379), maxRetriesPerRequest: null };

    this.worker = new Worker(
      PDF_QUEUE_NAME,
      async (job) => {
        return this.processJob(job);
      },
      {
        connection,
        concurrency: 3 // Render up to 3 PDFs concurrently in-memory
      }
    );

    this.worker.on('completed', (job) => {
      logger.info(`✅ PDF Worker Completed Job [${job.id}]`);
    });

    this.worker.on('failed', (job, err) => {
      logger.error(`❌ PDF Worker Failed Job [${job?.id}]: ${err.message}`);
    });

    logger.info(`👷 BullMQ PDF Worker Started for Queue: [${PDF_QUEUE_NAME}]`);
  }

  async processJob(job) {
    const { invoiceId } = job.data;
    logger.info(`⚙️ Processing Cloud PDF Generation for Invoice ID: [${invoiceId}]`);

    const invoice = await InvoiceModel.findById(invoiceId);
    if (!invoice) {
      logger.warn(`Invoice [${invoiceId}] not found. Skipping PDF generation.`);
      return { skipped: true };
    }

    invoice.pdfStatus = PdfStatus.PROCESSING;
    await invoice.save();

    try {
      const client = invoice.clientId ? await this.clientRepository.findById(invoice.clientId) : null;

      // Render HTML template to in-memory PDF Buffer using Puppeteer
      const pdfBuffer = await this.pdfService.generateInvoicePdfBuffer(invoice, client);
      if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new Error('Puppeteer generated an empty PDF buffer');
      }

      const fileName = `${invoice.invoiceNumber || `INV-${invoiceId}`}.pdf`;

      // Upload in-memory buffer directly to DigitalOcean Spaces / S3
      logger.info(`☁️ Uploading PDF directly to Cloud Storage for invoice [${fileName}]...`);
      const pdfUrl = await this.s3Service.uploadFile(pdfBuffer, `invoices/${fileName}`, 'application/pdf');

      if (!pdfUrl) {
        throw new Error('Cloud storage upload returned an empty URL');
      }

      logger.info(`🎉 Cloud PDF Successfully Uploaded: [${pdfUrl}]`);

      invoice.pdfUrl = pdfUrl;
      invoice.pdfStatus = PdfStatus.COMPLETED;
      invoice.pdfFailureReason = null;
      invoice.pdfGeneratedAt = new Date();
      await invoice.save();

      // Dispatch email notification with the attached PDF buffer
      const recipientEmail = client?.email || (client?.userId && typeof client.userId === 'object' ? client.userId.email : null);
      if (recipientEmail) {
        try {
          const { sendInvoiceEmail } = await import('../../shared/services/email.service.js');
          await sendInvoiceEmail({
            to: recipientEmail,
            client: client || { name: invoice.clientName, email: recipientEmail },
            invoice,
            pdfBuffer,
            pdfUrl,
          });
        } catch (emailErr) {
          logger.warn(`Could not dispatch PDF email to [${recipientEmail}]: ${emailErr.message}`);
        }
      }

      return { success: true, pdfUrl };
    } catch (err) {
      invoice.pdfStatus = PdfStatus.FAILED;
      invoice.pdfFailureReason = err.message;
      await invoice.save();
      logger.error(`❌ PDF Generation/Cloud Upload Failed for Invoice [${invoiceId}]: ${err.message}`);
      throw err;
    }
  }

  async close() {
    if (this.worker) {
      await this.worker.close();
    }
  }
}
