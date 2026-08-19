import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { logger } from '../../shared/utils/logger.js';

export class PdfService {
  constructor() {
    this.browser = null;
    this.logoBase64 = this.loadSaburiLogo();
  }

  /**
   * Helper to load Saburi Security Agency Logo as base64 data URI
   */
  loadSaburiLogo() {
    try {
      const logoPaths = [
        path.resolve('src/assets/brand/saburi-logo.png'),
        path.resolve('public/brand/saburi-logo.png'),
        path.resolve('c:/Users/HP/Downloads/Cctv main/cctv-Admin/public/brand/saburi-logo.png'),
        path.resolve('../cctv-Admin/public/brand/saburi-logo.png'),
        path.resolve('../CC/public/brand/saburi-logo.png')
      ];

      for (const logoPath of logoPaths) {
        if (fs.existsSync(logoPath)) {
          const fileData = fs.readFileSync(logoPath);
          return `data:image/png;base64,${fileData.toString('base64')}`;
        }
      }
    } catch (err) {
      logger.warn(`Could not load Saburi logo image file: ${err.message}`);
    }
    return 'https://satyakabir-bucket.sgp1.digitaloceanspaces.com/CCTV/brand/saburi-logo.png';
  }

  /**
   * Lazily obtain or initialize singleton Puppeteer browser instance
   */
  async getBrowser() {
    const isConnected = Boolean(this.browser && (typeof this.browser.isConnected === 'function' ? this.browser.isConnected() : this.browser.connected));
    if (isConnected) {
      return this.browser;
    }
    logger.info('🚀 Launching Puppeteer Singleton Browser Instance for PDF Generation...');
    let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (!executablePath || !fs.existsSync(executablePath)) {
      const fallbacks = [
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/brave-browser',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
      ];
      executablePath = fallbacks.find((p) => fs.existsSync(p)) || undefined;
    }

    this.browser = await puppeteer.launch({
      headless: 'new',
      executablePath: executablePath || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });
    return this.browser;
  }

  /**
   * Generate Invoice PDF Buffer from Invoice & Client Data
   */
  async generateInvoicePdfBuffer(invoice, client) {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 1 });
      
      const htmlContent = this.renderInvoiceHtml(invoice, client);
      await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 10000 });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' }
      });

      return pdfBuffer;
    } finally {
      await page.close();
    }
  }

  /**
   * Premium Industry-Standard Invoice Template for Saburi Security Agency
   */
  renderInvoiceHtml(invoice, client) {
    const itemsRows = (invoice.items || []).map((item, index) => `
      <tr class="${index % 2 === 0 ? 'even-row' : ''}">
        <td style="text-align: center; font-weight: 600; color: #64748b;">${index + 1}</td>
        <td style="font-weight: 600; color: #1e293b;">${item.description}</td>
        <td style="text-align: center; font-family: monospace; font-size: 11px; font-weight: 700; color: #475569; letter-spacing: 0.5px;">${item.hsnSac || '998529'}</td>
        <td style="text-align: center; color: #334155;">${item.quantity}</td>
        <td style="text-align: right; color: #334155;">₹${(item.unitPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right; font-weight: 700; color: #0f172a;">₹${(item.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      </tr>
    `).join('');

    const formattedDueDate = invoice.dueDate
      ? new Date(invoice.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : 'N/A';
    const formattedIssueDate = invoice.issueDate
      ? new Date(invoice.issueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : 'N/A';

    const status = String(invoice.status || 'UNPAID').toUpperCase();
    const isPaid = status === 'PAID';
    const isPartial = status === 'PARTIALLY_PAID' || status === 'PARTIAL';
    
    let statusBg = '#fee2e2';
    let statusBorder = '#fca5a5';
    let statusColor = '#b91c1c';

    if (isPaid) {
      statusBg = '#dcfce7';
      statusBorder = '#86efac';
      statusColor = '#15803d';
    } else if (isPartial) {
      statusBg = '#fef3c7';
      statusBorder = '#fde68a';
      statusColor = '#d97706';
    }

    // Determine Client Details
    const clientUser = client?.userId && typeof client.userId === 'object' ? client.userId : (client?.user || {});
    const clientName = client?.businessName || clientUser?.name || client?.name || 'Valued Client';
    const contactPerson = clientUser?.name || client?.contactPerson || '';
    const gstin = client?.gstin || invoice.gstin || '';
    const address = client?.installationAddress?.address || client?.address || 'Installation Site Address';
    const city = client?.installationAddress?.city || client?.city || '';
    const state = client?.installationAddress?.state || client?.state || 'Madhya Pradesh';
    const pincode = client?.installationAddress?.pincode || client?.pincode || '';
    const fullAddress = [address, city, state, pincode].filter(Boolean).join(', ');
    const phone = client?.phone || clientUser?.phone || 'N/A';
    const email = client?.email || clientUser?.email || 'N/A';

    // Tax amounts resolution
    const taxRate = invoice.taxPercentage ?? 18;
    const cgstRate = (taxRate / 2).toFixed(1);
    const sgstRate = (taxRate / 2).toFixed(1);

    const totalTax = invoice.taxAmount || 0;
    const isInterState = Boolean(invoice.igstAmount && invoice.igstAmount > 0);
    const cgstAmount = isInterState ? 0 : (invoice.cgstAmount ?? Math.round((totalTax / 2) * 100) / 100);
    const sgstAmount = isInterState ? 0 : (invoice.sgstAmount ?? Math.round((totalTax - cgstAmount) * 100) / 100);
    const igstAmount = isInterState ? (invoice.igstAmount ?? totalTax) : 0;

    // Logo rendering
    const logoSrc = this.logoBase64 || 'https://satyakabir-bucket.sgp1.digitaloceanspaces.com/CCTV/brand/saburi-logo.png';
    const logoHtml = `<img src="${logoSrc}" alt="Saburi Security Agency Logo" style="max-height: 68px; max-width: 220px; object-fit: contain;" />`;


    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Invoice - Saburi Security Agency</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
            color: #1e293b;
            background-color: #ffffff;
            font-size: 13px;
            line-height: 1.5;
          }
          .invoice-container {
            max-width: 850px;
            margin: 0 auto;
            background: #ffffff;
            padding: 24px;
          }
          
          /* Header Banner */
          .header-banner {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 20px;
            margin-bottom: 24px;
          }
          .agency-name {
            font-size: 22px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: -0.5px;
          }
          .agency-tagline {
            font-size: 11px;
            font-weight: 600;
            color: #d97706;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-top: 2px;
          }
          .agency-meta {
            font-size: 11px;
            color: #64748b;
            margin-top: 6px;
            line-height: 1.4;
          }
          .invoice-heading {
            text-align: right;
          }
          .invoice-title {
            font-size: 28px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: -1px;
          }
          .invoice-num {
            font-size: 13px;
            font-weight: 700;
            color: #64748b;
            margin-top: 2px;
          }
          .badge {
            display: inline-block;
            margin-top: 8px;
            padding: 4px 12px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.5px;
            border-radius: 9999px;
            background-color: ${statusBg};
            color: ${statusColor};
            border: 1px solid ${statusBorder};
          }

          /* Details Grid */
          .details-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
            margin-bottom: 24px;
          }
          .info-card {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 16px;
          }
          .card-title {
            font-size: 11px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 4px;
          }
          .client-name {
            font-size: 15px;
            font-weight: 700;
            color: #0f172a;
          }

          /* Items Table */
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 24px;
          }
          .items-table th {
            background-color: #0f172a;
            color: #ffffff;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 10px 12px;
          }
          .items-table td {
            padding: 12px;
            border-bottom: 1px solid #e2e8f0;
            font-size: 12px;
          }
          .even-row {
            background-color: #f8fafc;
          }

          /* Summary Layout */
          .summary-wrapper {
            display: flex;
            justify-content: space-between;
            gap: 32px;
            margin-bottom: 30px;
          }
          .payment-terms {
            flex: 1;
            font-size: 11px;
            color: #64748b;
            line-height: 1.6;
          }
          .summary-card {
            width: 320px;
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 16px;
          }
          .summary-line {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 12px;
            color: #475569;
          }
          .summary-line.total {
            border-top: 2px solid #0f172a;
            padding-top: 10px;
            margin-top: 10px;
            font-size: 15px;
            font-weight: 800;
            color: #0f172a;
          }

          /* Footer */
          .invoice-footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
          }
          .stamp-box {
            text-align: center;
            width: 180px;
          }
          .signature-line {
            border-bottom: 1px dashed #94a3b8;
            height: 40px;
            margin-bottom: 6px;
          }
        </style>
      </head>
      <body>
        <div class="invoice-container">
          <!-- Top Header Banner -->
          <div class="header-banner">
            <div>
              <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 6px;">
                ${logoHtml}
                <div>
                  <div class="agency-name">SABURI SECURITY AGENCY</div>
                  <div class="agency-tagline">Licensed Security & CCTV Surveillance Solutions</div>
                </div>
              </div>
              <div class="agency-meta">
                HQ: Main Commercial Complex, City Center<br>
                Contact: +91 98765 43210 | Email: billing@saburisecurity.com<br>
                GSTIN: 23AABCS1234D1Z5
              </div>
            </div>
            <div class="invoice-heading">
              <div class="invoice-title">TAX INVOICE</div>
              <div class="invoice-num"># ${invoice.invoiceNumber || ''}</div>
              <div><span class="badge">${status}</span></div>
            </div>
          </div>

          <!-- Billing Info Grid -->
          <div class="details-grid">
            <div class="info-card">
              <div class="card-title">Billed To (Client Details)</div>
              <div class="client-name">${clientName}</div>
              ${contactPerson && contactPerson !== clientName ? `<div style="font-weight: 600; color: #334155; margin-top: 2px;">Attn: ${contactPerson}</div>` : ''}
              ${gstin ? `<div style="font-weight: 700; color: #0f172a; margin-top: 4px; font-size: 11px;">GSTIN: ${gstin}</div>` : ''}
              <div style="color: #475569; margin-top: 4px;">
                ${fullAddress}
              </div>
              <div style="color: #475569; margin-top: 6px; font-weight: 600;">
                Phone: ${phone}<br>
                Email: ${email}
              </div>
            </div>
            
            <div class="info-card">
              <div class="card-title">Invoice Meta</div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span style="color: #64748b;">Issue Date:</span>
                <span style="font-weight: 700;">${formattedIssueDate}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span style="color: #64748b;">Due Date:</span>
                <span style="font-weight: 700; color: #d97706;">${formattedDueDate}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span style="color: #64748b;">Currency:</span>
                <span style="font-weight: 700;">${invoice.currency || 'INR'}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span style="color: #64748b;">Payment Status:</span>
                <span style="font-weight: 700; color: ${statusColor};">${status}</span>
              </div>
            </div>
          </div>

          <!-- Items Table -->
          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 5%; text-align: center;">#</th>
                <th style="width: 45%; text-align: left;">Item & Description</th>
                <th style="width: 14%; text-align: center;">HSN / SAC</th>
                <th style="width: 8%; text-align: center;">Qty</th>
                <th style="width: 14%; text-align: right;">Unit Rate</th>
                <th style="width: 14%; text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>

          <!-- Summary & Payment Info -->
          <div class="summary-wrapper">
            <div class="payment-terms">
              <div style="font-weight: 700; color: #0f172a; margin-bottom: 4px;">Terms & Payment Instructions:</div>
              <p>• Bank: State Bank of India | A/C: 39482019283 | IFSC: SBIN0001234</p>
              <p>• UPI ID: saburi.security@sbi</p>
              <p>• GST Classification: Services SAC 998529 (CCTV Monitoring) / Goods HSN 8525 (Surveillance Hardware)</p>
              <p>• Please pay by the due date to avoid service interruption.</p>
              ${invoice.notes ? `<p style="margin-top: 6px; font-style: italic;">Note: ${invoice.notes}</p>` : ''}
            </div>

            <div class="summary-card">
              <div class="summary-line">
                <span>Taxable Amount (Subtotal):</span>
                <span>₹${(invoice.subtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              ${isInterState ? `
              <div class="summary-line">
                <span>IGST (${taxRate}%):</span>
                <span>₹${(igstAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>` : `
              <div class="summary-line">
                <span>CGST (${cgstRate}%):</span>
                <span>₹${(cgstAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div class="summary-line">
                <span>SGST (${sgstRate}%):</span>
                <span>₹${(sgstAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>`}
              ${(invoice.discountAmount || 0) > 0 ? `
              <div class="summary-line" style="color: #16a34a; font-weight: 600;">
                <span>Discount:</span>
                <span>-₹${(invoice.discountAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>` : ''}
              <div class="summary-line total">
                <span>Total Amount (INR):</span>
                <span>₹${(invoice.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              ${(invoice.amountPaid || 0) > 0 ? `
              <div class="summary-line" style="color: #16a34a; font-weight: 600; margin-top: 4px;">
                <span>Amount Paid:</span>
                <span>₹${(invoice.amountPaid).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>` : ''}
              ${(invoice.amountDue !== undefined && invoice.amountDue !== null && invoice.amountDue > 0) ? `
              <div class="summary-line" style="color: #dc2626; font-weight: 700;">
                <span>Balance Due:</span>
                <span>₹${(invoice.amountDue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>` : ''}
            </div>
          </div>

          <!-- Footer -->
          <div class="invoice-footer">
            <div style="color: #64748b; font-size: 11px;">
              Thank you for trusting <strong>Saburi Security Agency</strong> for your surveillance & security needs.<br>
              This is a computer-generated invoice.
            </div>
            <div class="stamp-box">
              <div class="signature-line"></div>
              <div style="font-size: 11px; font-weight: 700; color: #0f172a;">For Saburi Security Agency</div>
              <div style="font-size: 10px; color: #64748b;">Authorized Signatory</div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  async destroy() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
