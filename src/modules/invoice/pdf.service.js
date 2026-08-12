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
        path.resolve('c:/Users/HP/Downloads/Cctv main/cctv-Admin/public/brand/saburi-logo.png'),
        path.resolve('../cctv-Admin/public/brand/saburi-logo.png')
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
    return '';
  }

  /**
   * Lazily obtain or initialize singleton Puppeteer browser instance
   */
  async getBrowser() {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }
    logger.info('🚀 Launching Puppeteer Singleton Browser Instance for PDF Generation...');
    let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (executablePath && !fs.existsSync(executablePath)) {
      const fallbacks = ['/usr/bin/chromium-browser', '/usr/bin/chromium'];
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

    const isPaid = invoice.status === 'PAID';
    const statusBg = isPaid ? '#dcfce7' : '#fee2e2';
    const statusBorder = isPaid ? '#86efac' : '#fca5a5';
    const statusColor = isPaid ? '#15803d' : '#b91c1c';

    // Logo rendering (Image or fallback SVG shield emblem)
    const logoHtml = this.logoBase64
      ? `<img src="${this.logoBase64}" alt="Saburi Security Agency Logo" style="max-height: 65px; width: auto; object-fit: contain;" />`
      : `
        <div style="display: flex; align-items: center; gap: 10px;">
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L3 7V12C3 17.55 6.84 22.74 12 24C17.16 22.74 21 17.55 21 12V7L12 2Z" fill="#0f172a"/>
            <path d="M12 6L17 9V12C17 15.3 14.87 18.3 12 19.3C9.13 18.3 7 15.3 7 12V9L12 6Z" fill="#d97706"/>
          </svg>
        </div>
      `;

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
            max-width: 800px;
            margin: 0 auto;
            padding: 32px;
          }
          /* Top Header Banner */
          .header-banner {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding-bottom: 24px;
            border-bottom: 3px solid #0f172a;
          }
          .agency-name {
            font-size: 24px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: -0.5px;
            text-transform: uppercase;
          }
          .agency-tagline {
            font-size: 11px;
            font-weight: 600;
            color: #d97706;
            text-transform: uppercase;
            letter-spacing: 0.5px;
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
            font-size: 30px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: 1px;
          }
          .invoice-num {
            font-size: 14px;
            font-weight: 700;
            color: #475569;
            margin-top: 2px;
          }
          .badge {
            display: inline-block;
            margin-top: 8px;
            padding: 5px 14px;
            font-size: 11px;
            font-weight: 800;
            border-radius: 6px;
            background-color: ${statusBg};
            border: 1px solid ${statusBorder};
            color: ${statusColor};
            letter-spacing: 0.5px;
            text-transform: uppercase;
          }
          
          /* Details Grid */
          .details-grid {
            display: flex;
            justify-content: space-between;
            gap: 24px;
            margin: 28px 0;
          }
          .info-card {
            flex: 1;
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 16px;
          }
          .card-title {
            font-size: 10px;
            font-weight: 800;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            margin-bottom: 8px;
          }
          .client-name {
            font-size: 15px;
            font-weight: 700;
            color: #0f172a;
          }

          /* Table Styling */
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 24px 0 20px 0;
          }
          .items-table th {
            background-color: #0f172a;
            color: #ffffff;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 12px;
          }
          .items-table td {
            padding: 12px;
            border-bottom: 1px solid #e2e8f0;
          }
          .items-table tr.even-row {
            background-color: #f8fafc;
          }

          /* Summary Box */
          .summary-wrapper {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-top: 10px;
          }
          .payment-terms {
            width: 55%;
            font-size: 11px;
            color: #64748b;
            background-color: #f1f5f9;
            border-radius: 8px;
            padding: 14px;
          }
          .summary-card {
            width: 40%;
            background-color: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 16px;
          }
          .summary-line {
            display: flex;
            justify-content: space-between;
            padding: 6px 0;
            font-size: 12px;
            color: #475569;
          }
          .summary-line.total {
            border-top: 2px solid #0f172a;
            margin-top: 8px;
            padding-top: 10px;
            font-size: 16px;
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
              <div><span class="badge">${invoice.status || 'UNPAID'}</span></div>
            </div>
          </div>

          <!-- Billing Info Grid -->
          <div class="details-grid">
            <div class="info-card">
              <div class="card-title">Billed To (Client Details)</div>
              <div class="client-name">${client?.name || client?.user?.name || 'Valued Client'}</div>
              <div style="color: #475569; margin-top: 4px;">
                ${client?.installationAddress?.address || client?.address || 'Installation Site Address'}<br>
                ${client?.installationAddress?.city || client?.city || ''}
              </div>
              <div style="color: #475569; margin-top: 6px; font-weight: 600;">
                Phone: ${client?.user?.phone || client?.phone || 'N/A'}<br>
                Email: ${client?.user?.email || client?.email || 'N/A'}
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
            </div>
          </div>

          <!-- Items Table -->
          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 6%; text-align: center;">#</th>
                <th style="width: 50%; text-align: left;">Item & Description</th>
                <th style="width: 10%; text-align: center;">Qty</th>
                <th style="width: 17%; text-align: right;">Unit Rate</th>
                <th style="width: 17%; text-align: right;">Amount</th>
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
              <p>• Please pay by the due date to avoid service interruption.</p>
              ${invoice.notes ? `<p style="margin-top: 6px; font-style: italic;">Note: ${invoice.notes}</p>` : ''}
            </div>

            <div class="summary-card">
              <div class="summary-line">
                <span>Subtotal:</span>
                <span>₹${(invoice.subtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div class="summary-line">
                <span>GST (${invoice.taxPercentage || 18}%):</span>
                <span>₹${(invoice.taxAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              ${(invoice.discountAmount || 0) > 0 ? `
              <div class="summary-line" style="color: #16a34a; font-weight: 600;">
                <span>Discount:</span>
                <span>-₹${(invoice.discountAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>` : ''}
              <div class="summary-line total">
                <span>Total Amount:</span>
                <span>₹${(invoice.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
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
