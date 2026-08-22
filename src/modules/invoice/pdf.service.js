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
   * Convert number to Indian English words (e.g. Thirty Five Thousand Four Hundred Rupees only)
   */
  numberToIndianWords(amount) {
    if (amount == null || isNaN(amount) || Number(amount) === 0) return 'Zero Rupees only';
    
    const ones = [
      '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
      'Seventeen', 'Eighteen', 'Nineteen'
    ];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function convertTwoDigits(n) {
      if (n < 20) return ones[n];
      const t = Math.floor(n / 10);
      const o = n % 10;
      return tens[t] + (o ? ' ' + ones[o] : '');
    }

    function convertThreeDigits(n) {
      const hundred = Math.floor(n / 100);
      const rest = n % 100;
      let res = '';
      if (hundred > 0) {
        res += ones[hundred] + ' Hundred';
        if (rest > 0) res += ' ';
      }
      if (rest > 0) {
        res += convertTwoDigits(rest);
      }
      return res.trim();
    }

    const num = Math.abs(Number(amount));
    const integerPart = Math.floor(num);
    const decimalPart = Math.round((num - integerPart) * 100);

    const crores = Math.floor(integerPart / 10000000);
    const lakhs = Math.floor((integerPart % 10000000) / 100000);
    const thousands = Math.floor((integerPart % 100000) / 1000);
    const remaining = integerPart % 1000;

    const words = [];
    if (crores > 0) words.push(convertThreeDigits(crores) + ' Crore');
    if (lakhs > 0) words.push(convertTwoDigits(lakhs) + ' Lakh');
    if (thousands > 0) words.push(convertTwoDigits(thousands) + ' Thousand');
    if (remaining > 0) words.push(convertThreeDigits(remaining));

    let rupeeStr = words.join(' ').trim();
    if (!rupeeStr) rupeeStr = 'Zero';

    let result = rupeeStr + ' Rupees';
    if (decimalPart > 0) {
      result += ' and ' + convertTwoDigits(decimalPart) + ' Paise';
    }
    result += ' only';
    return result;
  }

  /**
   * Format Indian Currency with space (e.g. ₹ 35,400.00)
   */
  formatInr(val) {
    const num = Number(val || 0);
    return `₹ ${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  /**
   * Format Date to DD-MM-YYYY
   */
  formatDateDdMmYyyy(dateVal) {
    if (!dateVal) return '—';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }

  /**
   * Exact Match Invoice Template for Saburi Security Agency
   */
  renderInvoiceHtml(invoice, client) {
    // Determine Company Profile Defaults
    const companyName = 'SABURI SECURIT AGENCY PVT LTD';
    const companyAddress = 'Ward No.24 House No19 Polytechnic Road Moti Nagar BALAGHAT<br>481001';
    const companyPhones = 'Phone no.: 7880121658, 8815450965';
    const companyEmail = 'Email: saburis359@gmail.com';
    const companyGstin = 'GSTIN: 23ABACS9890G1Z2';
    const companyState = 'State: 23-Madhya Pradesh';

    const bankAccountNo = 'ACCOUNT No.- 005505013852';
    const bankIfsc = 'IFSC Code - ICIC0000055';
    const bankBranch = 'BRANCH - BHOPAL';

    // Determine Client Details
    const clientUser = client?.userId && typeof client.userId === 'object' ? client.userId : (client?.user || {});
    const clientName = client?.businessName || clientUser?.name || client?.name || 'INTERIORS INSIGHT LLP';
    const address = client?.installationAddress?.address || client?.address || 'SECTOR-G SHRI VIGHNESH WAREHOUSE AND DISTRIBUTORS PVT LTD PLOT NO-13-A J K ROAD BHOPAL';
    const city = client?.installationAddress?.city || client?.city || '';
    const stateName = client?.installationAddress?.state || client?.state || 'Madhya Pradesh';
    const pincode = client?.installationAddress?.pincode || client?.pincode || '';
    const fullAddress = [address, city, pincode].filter(Boolean).join(' ');
    const phone = client?.phone || clientUser?.phone || '9039102070';
    const clientGstin = client?.gstin || invoice.gstin || '';

    // State formatting: 23-Madhya Pradesh
    const stateCode = clientGstin && /^[0-9]{2}/.test(clientGstin) ? clientGstin.slice(0, 2) : '23';
    const clientStateDisplay = `${stateCode}-${stateName.replace(/^[0-9]+-/, '')}`;

    // Invoice Meta
    const invoiceNumber = invoice.invoiceNumber || invoice.id || 'SSA/PVT/26-27/018';
    const invoiceDate = this.formatDateDdMmYyyy(invoice.issueDate || invoice.createdAt || new Date());

    // Tax Resolution
    const taxRate = Number(invoice.taxPercentage ?? 18);
    const halfRate = (taxRate / 2).toFixed(1);
    const isInterState = Boolean(invoice.igstAmount && invoice.igstAmount > 0);
    const subtotal = Number(invoice.subtotal ?? (invoice.taxableAmount ?? 0));
    const totalTax = Number(invoice.taxAmount ?? 0);
    const cgstAmount = isInterState ? 0 : (invoice.cgstAmount ?? Math.round((totalTax / 2) * 100) / 100);
    const sgstAmount = isInterState ? 0 : (invoice.sgstAmount ?? Math.round((totalTax - cgstAmount) * 100) / 100);
    const igstAmount = isInterState ? (invoice.igstAmount ?? totalTax) : 0;
    const grandTotal = Number(invoice.totalAmount ?? (invoice.total ?? (subtotal + totalTax)));
    const amountReceived = Number(invoice.amountPaid || 0);
    const balanceDue = Number(invoice.amountDue !== undefined && invoice.amountDue !== null ? invoice.amountDue : Math.max(0, grandTotal - amountReceived));

    // Items Resolution
    const items = (invoice.items && invoice.items.length)
      ? invoice.items
      : [
          {
            description: 'CCTV Surveillance & Remote Monitoring Services',
            hsnSac: '998529',
            quantity: 3,
            unitPrice: 5000,
            amount: 15000,
            taxAmount: 2700
          },
          {
            description: 'CAMERA INSTALLATION',
            hsnSac: '998529',
            quantity: 3,
            unitPrice: 5000,
            amount: 15000,
            taxAmount: 2700
          }
        ];

    let totalQuantity = 0;
    let totalItemsGst = 0;
    let totalItemsAmount = 0;

    const itemsRows = items.map((item, index) => {
      const qty = Number(item.quantity || 1);
      const unitPrice = Number(item.unitPrice || 0);
      const baseAmount = Number(item.amount || qty * unitPrice);
      const itemGst = Number(item.taxAmount ?? Math.round(baseAmount * (taxRate / 100) * 100) / 100);
      const itemTotalWithGst = baseAmount + itemGst;

      totalQuantity += qty;
      totalItemsGst += itemGst;
      totalItemsAmount += itemTotalWithGst;

      return `
        <tr>
          <td style="padding: 7px 8px; vertical-align: top; text-align: left; border-bottom: 1px solid #f1f5f9; color: #1e293b;">${index + 1}</td>
          <td style="padding: 7px 8px; vertical-align: top; text-align: left; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0f172a;">${item.description}</td>
          <td style="padding: 7px 8px; vertical-align: top; text-align: center; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 11px;">${item.hsnSac || '998529'}</td>
          <td style="padding: 7px 8px; vertical-align: top; text-align: right; border-bottom: 1px solid #f1f5f9; color: #1e293b;">${qty}</td>
          <td style="padding: 7px 8px; vertical-align: top; text-align: right; border-bottom: 1px solid #f1f5f9; color: #1e293b; white-space: nowrap;">${this.formatInr(unitPrice)}</td>
          <td style="padding: 7px 8px; vertical-align: top; text-align: right; border-bottom: 1px solid #f1f5f9; color: #1e293b; white-space: nowrap;">
            ${this.formatInr(itemGst)}<br>
            <span style="font-size: 9.5px; color: #475569;">(${taxRate.toFixed(1)}%)</span>
          </td>
          <td style="padding: 7px 8px; vertical-align: top; text-align: right; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-weight: 600; white-space: nowrap;">${this.formatInr(itemTotalWithGst)}</td>
        </tr>
      `;
    }).join('');

    const displayGstTotal = totalItemsGst > 0 ? totalItemsGst : totalTax;
    const displayGrandTotal = totalItemsAmount > 0 ? totalItemsAmount : grandTotal;
    const amountInWords = this.numberToIndianWords(displayGrandTotal);

    const logoSrc = this.logoBase64 || 'https://satyakabir-bucket.sgp1.digitaloceanspaces.com/CCTV/brand/saburi-logo.png';
    const logoHtml = `<img src="${logoSrc}" alt="Saburi Logo" style="max-height: 105px; max-width: 120px; object-fit: contain;" />`;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Tax Invoice - ${companyName}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Plus Jakarta Sans', Arial, Helvetica, sans-serif;
            color: #0f172a;
            background-color: #ffffff;
            font-size: 11px;
            line-height: 1.45;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .invoice-page {
            max-width: 800px;
            margin: 0 auto;
            background: #ffffff;
            padding: 10px 14px;
          }

          /* Header Section */
          .top-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 8px;
          }
          .company-block {
            max-width: 70%;
          }
          .company-title {
            font-size: 17px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: -0.2px;
            margin-bottom: 2px;
          }
          .company-line {
            font-size: 11px;
            color: #1e293b;
            line-height: 1.35;
          }
          .logo-block {
            text-align: right;
            padding-top: 2px;
          }

          /* Red Tax Invoice Banner */
          .tax-invoice-bar {
            border-top: 1.5px solid #a91d22;
            border-bottom: 1.5px solid #a91d22;
            color: #a91d22;
            font-size: 17px;
            font-weight: 800;
            text-align: center;
            padding: 2px 0;
            margin: 10px 0 14px 0;
            letter-spacing: 0.3px;
          }

          /* Bill To & Invoice Meta Section */
          .parties-section {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 16px;
            font-size: 11px;
          }
          .bill-to-box {
            flex: 1;
            padding-right: 20px;
          }
          .invoice-meta-box {
            width: 250px;
            text-align: right;
          }
          .section-heading {
            font-size: 11px;
            font-weight: 700;
            color: #0f172a;
            margin-bottom: 3px;
          }
          .client-headline {
            font-size: 12px;
            font-weight: 800;
            color: #0f172a;
            margin-bottom: 2px;
          }
          .detail-line {
            color: #1e293b;
            line-height: 1.35;
            margin-bottom: 1px;
          }
          .meta-row {
            display: flex;
            justify-content: flex-end;
            gap: 6px;
            line-height: 1.45;
          }
          .meta-label {
            color: #0f172a;
            font-weight: 600;
          }
          .meta-value {
            font-weight: 600;
            color: #0f172a;
          }

          /* Table Section */
          .invoice-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 14px;
            font-size: 11px;
          }
          .invoice-table th {
            background-color: #a91d22;
            color: #ffffff;
            font-size: 10.5px;
            font-weight: 700;
            padding: 6px 8px;
            border: none;
            letter-spacing: 0.2px;
          }
          .invoice-table td {
            font-size: 11px;
          }
          .table-total-row td {
            border-top: 1.5px solid #0f172a !important;
            border-bottom: 1.5px solid #0f172a !important;
            padding: 6px 8px !important;
            font-weight: 800;
            color: #0f172a;
          }

          /* Bottom Layout */
          .bottom-section {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 20px;
            margin-top: 10px;
            font-size: 11px;
          }
          .bottom-left {
            flex: 1;
            padding-right: 10px;
          }
          .bottom-right {
            width: 320px;
          }

          .block-label {
            font-weight: 800;
            color: #0f172a;
            margin-bottom: 2px;
          }
          .block-sub {
            font-weight: 700;
            color: #0f172a;
            margin-bottom: 2px;
          }

          /* Summary Calculations */
          .calc-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
          }
          .calc-table td {
            padding: 3px 0;
          }
          .calc-label {
            text-align: left;
            color: #0f172a;
            font-weight: 600;
          }
          .calc-value {
            text-align: right;
            color: #0f172a;
            font-weight: 600;
            white-space: nowrap;
          }
          .total-red-bar {
            background-color: #a91d22;
            color: #ffffff !important;
            font-weight: 800;
            padding: 5px 8px !important;
          }
          .total-red-bar td {
            color: #ffffff !important;
            font-size: 12px;
            font-weight: 800;
            padding: 4px 8px !important;
          }
          .balance-bottom-line {
            border-bottom: 1.5px solid #0f172a;
            padding-bottom: 4px;
          }

          /* Signatory */
          .signatory-box {
            margin-top: 24px;
            text-align: right;
          }
          .signatory-title {
            font-size: 11px;
            font-weight: 700;
            color: #0f172a;
          }
          .signature-graphic {
            height: 38px;
            margin: 6px 0 2px auto;
            display: flex;
            justify-content: flex-end;
            align-items: center;
          }
          .signatory-subtitle {
            font-size: 11px;
            font-weight: 800;
            color: #0f172a;
          }
        </style>
      </head>
      <body>
        <div class="invoice-page">
          <!-- Top Company Header -->
          <div class="top-header">
            <div class="company-block">
              <div class="company-title">${companyName}</div>
              <div class="company-line">${companyAddress}</div>
              <div class="company-line">${companyPhones}</div>
              <div class="company-line">${companyEmail}</div>
              <div class="company-line">${companyGstin}</div>
              <div class="company-line">${companyState}</div>
            </div>
            <div class="logo-block">
              ${logoHtml}
            </div>
          </div>

          <!-- Centered Tax Invoice Banner -->
          <div class="tax-invoice-bar">
            Tax Invoice
          </div>

          <!-- Parties & Meta Section -->
          <div class="parties-section">
            <div class="bill-to-box">
              <div class="section-heading">Bill To</div>
              <div class="client-headline">${clientName}</div>
              <div class="detail-line">${fullAddress}</div>
              <div class="detail-line">Contact No.: ${phone}</div>
              ${clientGstin ? `<div class="detail-line">GSTIN Number: ${clientGstin}</div>` : ''}
              <div class="detail-line">State: ${clientStateDisplay}</div>
            </div>

            <div class="invoice-meta-box">
              <div class="section-heading" style="text-align: right;">Invoice Details</div>
              <div class="meta-row">
                <span class="meta-label">Invoice No.:</span>
                <span class="meta-value">${invoiceNumber}</span>
              </div>
              <div class="meta-row">
                <span class="meta-label">Date:</span>
                <span class="meta-value">${invoiceDate}</span>
              </div>
            </div>
          </div>

          <!-- Items Table -->
          <table class="invoice-table">
            <thead>
              <tr>
                <th style="width: 4%; text-align: left;">#</th>
                <th style="width: 38%; text-align: left;">Item name</th>
                <th style="width: 14%; text-align: center;">HSN / SAC</th>
                <th style="width: 8%; text-align: right;">Quantity</th>
                <th style="width: 12%; text-align: right;">Price/ unit</th>
                <th style="width: 12%; text-align: right;">GST</th>
                <th style="width: 12%; text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
              <tr class="table-total-row">
                <td style="text-align: left;">Total</td>
                <td></td>
                <td></td>
                <td style="text-align: right;">${totalQuantity}</td>
                <td></td>
                <td style="text-align: right;">${this.formatInr(displayGstTotal)}</td>
                <td style="text-align: right;">${this.formatInr(displayGrandTotal)}</td>
              </tr>
            </tbody>
          </table>

          <!-- Bottom Section -->
          <div class="bottom-section">
            <!-- Left Info -->
            <div class="bottom-left">
              <div class="block-label">Description</div>
              <div class="block-sub">Account Details</div>
              <div class="detail-line">${bankAccountNo}</div>
              <div class="detail-line">${bankIfsc}</div>
              <div class="detail-line">${bankBranch}</div>

              <div style="margin-top: 14px;">
                <div class="block-label">Invoice Amount In Words</div>
                <div class="detail-line" style="text-transform: capitalize;">${amountInWords}</div>
              </div>

              <div style="margin-top: 14px;">
                <div class="block-label">Terms And Conditions</div>
                <div class="detail-line" style="font-size: 10px; color: #1e293b;">COMMITMENT TO PROVIDE YOU THE BEST CCTV & REMOTE MONITORING SERVICES</div>
              </div>
            </div>

            <!-- Right Calculations -->
            <div class="bottom-right">
              <table class="calc-table">
                <tr>
                  <td class="calc-label"><span title="Taxable Amount (Subtotal)">Sub Total</span></td>
                  <td class="calc-value">${this.formatInr(subtotal)}</td>
                </tr>
                ${isInterState ? `
                <tr>
                  <td class="calc-label">IGST@${taxRate.toFixed(1)}%</td>
                  <td class="calc-value">${this.formatInr(igstAmount)}</td>
                </tr>
                ` : `
                <tr>
                  <td class="calc-label">SGST@${halfRate}%</td>
                  <td class="calc-value">${this.formatInr(sgstAmount)}</td>
                </tr>
                <tr>
                  <td class="calc-label">CGST@${halfRate}%</td>
                  <td class="calc-value">${this.formatInr(cgstAmount)}</td>
                </tr>
                `}
                <tr class="total-red-bar">
                  <td>Total</td>
                  <td style="text-align: right;">${this.formatInr(displayGrandTotal)}</td>
                </tr>
                <tr>
                  <td class="calc-label">Received</td>
                  <td class="calc-value">${this.formatInr(amountReceived)}</td>
                </tr>
                <tr class="balance-bottom-line">
                  <td class="calc-label">Balance</td>
                  <td class="calc-value">${this.formatInr(balanceDue)}</td>
                </tr>
              </table>

              <!-- Signatory Block -->
              <div class="signatory-box">
                <div class="signatory-title">For: ${companyName}</div>
                <div class="signature-graphic">
                  <svg width="125" height="34" viewBox="0 0 125 34" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 24C18 10 26 6 32 20C38 34 44 8 52 12C60 16 66 28 74 14C82 2 86 26 96 16C104 8 112 12 120 10" stroke="#1e293b" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M18 30C36 28 64 27 106 29" stroke="#1e293b" stroke-width="1.1" stroke-linecap="round"/>
                  </svg>
                </div>
                <div class="signatory-subtitle">Authorized Signatory</div>
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
