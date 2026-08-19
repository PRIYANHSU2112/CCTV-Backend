import { jest } from '@jest/globals';
import { InvoiceService, inferHsnSac } from '../../modules/invoice/invoice.service.js';
import { createInvoiceSchema } from '../../modules/invoice/invoice.validator.js';
import { PdfService } from '../../modules/invoice/pdf.service.js';

import { CounterModel } from '../../modules/invoice/invoice.model.js';

describe('Invoice Module HSN/SAC Integration Tests', () => {
  describe('inferHsnSac', () => {
    it('should infer SAC 998529 for CCTV monitoring / subscription', () => {
      expect(inferHsnSac('CCTV Security Surveillance Subscription')).toBe('998529');
      expect(inferHsnSac('')).toBe('998529');
    });

    it('should infer HSN 85258900 for CCTV camera and dome hardware', () => {
      expect(inferHsnSac('4MP IP Dome Camera Hardware')).toBe('85258900');
      expect(inferHsnSac('Outdoor Bullet Camera 1080p')).toBe('85258900');
      expect(inferHsnSac('PTZ Camera 360 degree')).toBe('85258900');
    });

    it('should infer HSN 84717020 for NVR and DVR storage units', () => {
      expect(inferHsnSac('8-Channel NVR Network Video Recorder')).toBe('84717020');
      expect(inferHsnSac('4TB Surveillance Hard Disk HDD')).toBe('84717020');
    });

    it('should infer SAC 998719 for installation, repair and AMC services', () => {
      expect(inferHsnSac('CCTV Camera Installation & Wiring Service')).toBe('998719');
      expect(inferHsnSac('Annual Maintenance AMC Servicing')).toBe('998719');
    });
  });

  describe('createInvoiceSchema Validator', () => {
    it('should validate invoice payload with HSN/SAC code', () => {
      const validPayload = {
        clientId: '665a1b2c3d4e5f6a7b8c9d0e',
        dueDate: '2026-09-01T00:00:00.000Z',
        items: [
          {
            description: 'Dome Camera 4MP',
            hsnSac: '852589',
            quantity: 2,
            unitPrice: 2500
          },
          {
            description: 'Monthly Monitoring Service',
            hsnSac: '998529',
            quantity: 1,
            unitPrice: 1499
          }
        ]
      };

      const { error, value } = createInvoiceSchema.validate(validPayload);
      expect(error).toBeUndefined();
      expect(value.items[0].hsnSac).toBe('852589');
      expect(value.items[1].hsnSac).toBe('998529');
    });
  });

  describe('InvoiceService.createInvoice', () => {
    let invoiceService;
    let mockInvoiceRepository;
    let mockClientRepository;

    beforeEach(() => {
      jest.spyOn(CounterModel, 'findByIdAndUpdate').mockReturnValue({
        exec: jest.fn().mockResolvedValue({ seq: 42 })
      });

      mockInvoiceRepository = {
        create: jest.fn().mockImplementation((doc) => Promise.resolve({ id: 'inv_123', ...doc }))
      };
      mockClientRepository = {
        findById: jest.fn().mockResolvedValue({
          _id: '665a1b2c3d4e5f6a7b8c9d0e',
          currentSubscriptionId: { packageTier: 'PRO', monthlyCharge: 2499 }
        })
      };

      const mockPdfService = {
        generateInvoicePdfBuffer: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 test'))
      };

      invoiceService = new InvoiceService({
        invoiceRepository: mockInvoiceRepository,
        clientRepository: mockClientRepository,
        pdfService: mockPdfService
      });
    });

    it('should automatically assign HSN/SAC codes to line items on invoice creation', async () => {
      const payload = {
        clientId: '665a1b2c3d4e5f6a7b8c9d0e',
        items: [
          {
            description: 'CCTV Installation Service',
            quantity: 1,
            unitPrice: 1500
          },
          {
            description: 'Bullet Camera 5MP',
            hsnSac: '85258900',
            quantity: 2,
            unitPrice: 3000
          }
        ]
      };

      const result = await invoiceService.createInvoice(payload);

      expect(mockInvoiceRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            expect.objectContaining({ description: 'CCTV Installation Service', hsnSac: '998719' }),
            expect.objectContaining({ description: 'Bullet Camera 5MP', hsnSac: '85258900' })
          ]
        })
      );
      expect(result.id).toBe('inv_123');
    });
  });

  describe('InvoiceService S3 / Direct PDF Generation and Paginated Listing', () => {
    it('should generate and upload PDF to S3 and return public S3 URL', async () => {
      const mockInvoiceRepository = {
        update: jest.fn().mockResolvedValue({ id: 'inv_123', pdfUrl: 'https://cctv-backend-storage.s3.sgp1.amazonaws.com/invoices/INV-2026-00042.pdf' })
      };
      const mockPdfService = {
        generateInvoicePdfBuffer: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 test'))
      };
      const mockS3Service = {
        uploadFile: jest.fn().mockResolvedValue('https://cctv-backend-storage.s3.sgp1.amazonaws.com/invoices/INV-2026-00042.pdf')
      };

      const invoiceService = new InvoiceService({
        invoiceRepository: mockInvoiceRepository,
        clientRepository: {},
        pdfService: mockPdfService,
        s3Service: mockS3Service
      });

      const invoice = { _id: '665a1b2c3d4e5f6a7b8c9d0e', invoiceNumber: 'INV-2026-00042' };
      const client = { businessName: 'Test Business' };

      const result = await invoiceService.generateAndUploadPdf(invoice, client);
      expect(mockPdfService.generateInvoicePdfBuffer).toHaveBeenCalledWith(invoice, client);
      expect(mockInvoiceRepository.update).toHaveBeenCalledWith(
        '665a1b2c3d4e5f6a7b8c9d0e',
        expect.objectContaining({
          pdfStatus: 'COMPLETED',
          pdfUrl: expect.stringMatching(/INV-2026-00042\.pdf/)
        })
      );
      expect(result.pdfUrl).toBeDefined();
    });

    it('should return paginated invoices with enriched client and balance details', async () => {
      const mockInvoiceRepository = {
        findPaginatedInvoices: jest.fn().mockResolvedValue({
          items: [
            {
              id: 'inv_1',
              invoiceNumber: 'INV-2026-00001',
              clientName: 'Sanjay Sharma',
              businessName: 'Sharma Stores',
              totalAmount: 2948,
              amountPaid: 1000,
              amountDue: 1948,
              pdfUrl: 'https://cctv-backend-storage.s3.sgp1.amazonaws.com/invoices/INV-2026-00001.pdf'
            }
          ],
          total: 1
        })
      };

      const invoiceService = new InvoiceService({
        invoiceRepository: mockInvoiceRepository,
        clientRepository: {}
      });

      const response = await invoiceService.listInvoices({ page: 1, limit: 10 });
      expect(response.items).toHaveLength(1);
      expect(response.items[0].pdfUrl).toContain('INV-2026-00001.pdf');
      expect(response.total).toBe(1);
    });
  });

  describe('PdfService HTML Rendering with HSN/SAC', () => {
    it('should render HSN/SAC column in the PDF invoice HTML', () => {
      const pdfService = new PdfService();
      const mockInvoice = {
        invoiceNumber: 'INV-2026-00042',
        status: 'PAID',
        issueDate: new Date('2026-08-18'),
        dueDate: new Date('2026-09-02'),
        currency: 'INR',
        items: [
          {
            description: 'Pro Surveillance Subscription',
            hsnSac: '998529',
            quantity: 1,
            unitPrice: 2499,
            amount: 2499
          }
        ],
        subtotal: 2499,
        taxPercentage: 18,
        taxAmount: 449.82,
        totalAmount: 2948.82
      };

      const mockClient = {
        name: 'Alpha Corp',
        address: 'Sector 62, Noida',
        phone: '+919876543210',
        email: 'billing@alphacorp.com'
      };

      const html = pdfService.renderInvoiceHtml(mockInvoice, mockClient);

      expect(html).toContain('HSN / SAC');
      expect(html).toContain('998529');
      expect(html).toContain('Taxable Amount (Subtotal)');
      expect(html).toContain('CGST');
      expect(html).toContain('SGST');
    });
  });
});
