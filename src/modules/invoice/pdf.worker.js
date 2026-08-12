import fs from 'fs';
import path from 'path';
import { PDF_QUEUE_NAME } from './pdf-queue.service.js';
import { InvoiceModel, PdfStatus } from './invoice.model.js';
import { S3Service } from '../../shared/storage/s3.service.js';
import { env } from '../../config/env.config.js';
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

    // Ensure uploads/invoices output directory exists for fallback
    this.outputDir = path.resolve(process.cwd(), 'uploads', 'invoices');
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    this.worker = new Worker(
      PDF_QUEUE_NAME,
      async (job) => {
        return this.processJob(job);
      },
      {
        connection,
        concurrency: 3 // Render up to 3 PDFs concurrently
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
    logger.info(`⚙️ Processing PDF Generation for Invoice ID: [${invoiceId}]`);

    const invoice = await InvoiceModel.findById(invoiceId);
    if (!invoice) {
      logger.warn(`Invoice [${invoiceId}] not found. Skipping PDF generation.`);
      return { skipped: true };
    }

    invoice.pdfStatus = PdfStatus.PROCESSING;
    await invoice.save();

    try {
      const client = invoice.clientId ? await this.clientRepository.findById(invoice.clientId) : null;

      // Render HTML template to PDF Buffer using Puppeteer inside Worker container
      const pdfBuffer = await this.pdfService.generateInvoicePdfBuffer(invoice, client);
      const fileName = `${invoice.invoiceNumber || `INV-${invoiceId}`}.pdf`;

      let pdfUrl;

      // Upload directly to AWS S3 if credentials are provided in env
      if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
        logger.info(`☁️ Uploading PDF directly to AWS S3 Bucket [${env.AWS_S3_BUCKET}]...`);
        pdfUrl = await this.s3Service.uploadFile(pdfBuffer, `invoices/${fileName}`, 'application/pdf');
        logger.info(`🎉 PDF Successfully Uploaded to AWS S3: [${pdfUrl}]`);
      } else {
        // Fallback to local storage if AWS credentials are not set
        const filePath = path.join(this.outputDir, fileName);
        fs.writeFileSync(filePath, pdfBuffer);
        pdfUrl = `/uploads/invoices/${fileName}`;
        logger.info(`🎉 PDF Successfully Generated & Saved Locally: [${pdfUrl}]`);
      }

      invoice.pdfUrl = pdfUrl;
      invoice.pdfStatus = PdfStatus.COMPLETED;
      invoice.pdfFailureReason = null;
      invoice.pdfGeneratedAt = new Date();
      await invoice.save();

      return { success: true, pdfUrl };
    } catch (err) {
      invoice.pdfStatus = PdfStatus.FAILED;
      invoice.pdfFailureReason = err.message;
      await invoice.save();
      logger.error(`❌ PDF Generation Failed for Invoice [${invoiceId}]: ${err.message}`);
      throw err;
    }
  }

  async close() {
    await this.worker.close();
  }
}
