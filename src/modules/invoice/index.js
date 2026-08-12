import { createContainer, asClass, asValue } from 'awilix';
import { InvoiceRepository } from './invoice.repository.js';
import { InvoiceService } from './invoice.service.js';
import { PdfService } from './pdf.service.js';
import { PdfQueueService } from './pdf-queue.service.js';
import { PdfWorker } from './pdf.worker.js';
import { InvoiceController } from './invoice.controller.js';
import { createInvoiceRouter } from './invoice.routes.js';
import { invoiceSwaggerDocs } from './invoice.swagger.js';

export const initInvoiceModule = ({ clientRepository, redisClient = null, isWorker = false }) => {
  const moduleContainer = createContainer();

  moduleContainer.register({
    clientRepository: asValue(clientRepository)
  });

  if (redisClient) {
    moduleContainer.register({
      redisClient: asValue(redisClient),
      pdfQueueService: asClass(PdfQueueService).singleton()
    });
  }

  moduleContainer.register({
    pdfService: asClass(PdfService).singleton(),
    invoiceRepository: asClass(InvoiceRepository).singleton(),
    invoiceService: asClass(InvoiceService).scoped(),
    invoiceController: asClass(InvoiceController).scoped()
  });

  if (isWorker && redisClient) {
    moduleContainer.register({
      pdfWorker: asClass(PdfWorker).singleton()
    });
    moduleContainer.resolve('pdfWorker');
  }

  const invoiceController = moduleContainer.resolve('invoiceController');
  const router = createInvoiceRouter(invoiceController);

  return {
    router,
    container: moduleContainer,
    swaggerDocs: invoiceSwaggerDocs
  };
};

export { InvoiceService, InvoiceRepository, InvoiceController, PdfService, PdfQueueService, PdfWorker };
