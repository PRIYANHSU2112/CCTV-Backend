import nodemailer from 'nodemailer';
import { env } from '../../config/env.config.js';
import { logger } from '../utils/logger.js';
import { formatRupees } from '../utils/money.util.js';

let transporterInstance = null;

/**
 * Initialize and get Nodemailer Singleton Transporter
 */
export function getEmailTransporter() {
  if (!transporterInstance) {
    const user = env.SMTP_USER || 'sahujipriyanshu2112@gmail.com';
    const pass = (env.SMTP_PASS || 'zyikhapzhduwxtsv').replace(/\s+/g, '');

    transporterInstance = nodemailer.createTransport({
      host: env.SMTP_HOST || 'smtp.gmail.com',
      port: env.SMTP_PORT || 465,
      secure: env.SMTP_SECURE !== false, // true for 465, false for 587
      auth: {
        user,
        pass,
      },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
    });

    logger.info(`📧 Nodemailer SMTP Transporter initialized with user: [${user}]`);
  }
  return transporterInstance;
}

/**
 * Verify SMTP Connection
 */
export async function verifySmtpConnection() {
  try {
    const transporter = getEmailTransporter();
    await transporter.verify();
    logger.info('✅ SMTP Email Transporter connection successfully verified.');
    return { success: true };
  } catch (err) {
    logger.error(`❌ SMTP Email verification failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Helper: Format Date in IST
 */
function formatDate(date) {
  if (!date) return 'N/A';
  try {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return String(date);
  }
}

/**
 * Generate Modern, Glassmorphic, Industry-Standard HTML Email Template for Invoices
 */
function generateInvoiceHtml({ clientName, invoice, downloadUrl, isReceipt = false, paymentInfo = null }) {
  const invNumber = invoice.invoiceNumber || 'INV-DRAFT';
  const issueDate = formatDate(invoice.issueDate || invoice.createdAt || new Date());
  const dueDate = formatDate(invoice.dueDate || new Date());
  const status = (invoice.status || 'PAID').toUpperCase();

  const total = Number(invoice.totalAmount || 0);
  const paid = Number(invoice.amountPaid || 0);
  const due = Number(invoice.amountDue || 0);

  const statusColor =
    status === 'PAID'
      ? '#10b981'
      : status === 'PARTIALLY_PAID'
        ? '#f59e0b'
        : '#ef4444';

  const statusBg =
    status === 'PAID'
      ? '#ecfdf5'
      : status === 'PARTIALLY_PAID'
        ? '#fffbeb'
        : '#fef2f2';

  const statusBorder =
    status === 'PAID'
      ? '#a7f3d0'
      : status === 'PARTIALLY_PAID'
        ? '#fde68a'
        : '#fecaca';

  const items = invoice.items || [
    {
      description: 'CCTV Security Subscription & Surveillance Service',
      hsnSac: '998529',
      quantity: 1,
      unitPrice: invoice.subtotal || total / 1.18,
      amount: invoice.subtotal || total / 1.18,
    },
  ];

  const itemsRows = items
    .map(
      (item, idx) => `
      <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? 'background-color: #f8fafc;' : ''}">
        <td style="padding: 12px 16px; font-size: 14px; color: #1e293b; font-weight: 500;">${item.description || 'CCTV Security Service'}</td>
        <td style="padding: 12px 16px; font-size: 13px; color: #64748b; text-align: center;">${item.hsnSac || '998529'}</td>
        <td style="padding: 12px 16px; font-size: 14px; color: #334155; text-align: center;">${item.quantity || 1}</td>
        <td style="padding: 12px 16px; font-size: 14px; color: #334155; text-align: right;">${formatRupees(item.unitPrice || item.amount || 0)}</td>
        <td style="padding: 12px 16px; font-size: 14px; color: #0f172a; font-weight: 600; text-align: right;">${formatRupees(item.amount || 0)}</td>
      </tr>`
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isReceipt ? 'Payment Receipt' : 'Tax Invoice'} — ${invNumber}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 32px 12px;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table role="presentation" width="100%" max-width="640" cellpadding="0" cellspacing="0" style="max-width: 640px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01); border: 1px solid #e2e8f0;">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 28px 32px 24px 32px; color: #ffffff;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align: middle;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 14px;">
                          <img src="https://satyakabir-bucket.sgp1.digitaloceanspaces.com/CCTV/brand/saburi-logo.png" alt="Saburi Security Solutions" width="48" height="48" style="display: block; width: 48px; height: 48px; border-radius: 10px; object-fit: contain; background: #ffffff; padding: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);" />
                        </td>
                        <td style="vertical-align: middle;">
                          <div style="font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff; line-height: 24px;">
                            SABURI <span style="color: #38bdf8;">SECURITY</span>
                          </div>
                          <div style="font-size: 11px; color: #94a3b8; margin-top: 3px; letter-spacing: 0.5px; text-transform: uppercase;">
                            24/7 Smart Surveillance & Security Cloud
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="vertical-align: middle;">
                    <span style="display: inline-block; padding: 6px 14px; border-radius: 9999px; font-size: 12px; font-weight: 700; background-color: ${statusBg}; color: ${statusColor}; border: 1px solid ${statusBorder}; text-transform: uppercase; letter-spacing: 0.5px;">
                      ${status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Welcome & Summary Card -->
          <tr>
            <td style="padding: 28px 32px 20px 32px;">
              <h1 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 700; color: #0f172a;">
                ${isReceipt ? 'Payment Confirmed 🎉' : 'Your Tax Invoice is Ready 📄'}
              </h1>
              <p style="margin: 0; font-size: 14px; line-height: 22px; color: #475569;">
                Hello <strong>${clientName || 'Valued Customer'}</strong>,<br>
                ${isReceipt
      ? `Thank you for your payment of <strong>${formatRupees(paymentInfo?.amount || paid)}</strong>. Your subscription has been updated and the official receipt is attached below.`
      : `Please find your invoice <strong>${invNumber}</strong> for CCTV surveillance services attached with this email.`
    }
              </p>
            </td>
          </tr>

          <!-- Meta Details Grid -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border-radius: 12px; padding: 16px; border: 1px solid #e2e8f0;">
                <tr>
                  <td width="50%" style="padding: 6px 12px; vertical-align: top;">
                    <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase;">Invoice Number</div>
                    <div style="font-size: 15px; color: #0f172a; font-weight: 700; margin-top: 2px;">${invNumber}</div>
                  </td>
                  <td width="50%" style="padding: 6px 12px; vertical-align: top;">
                    <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase;">Issue Date</div>
                    <div style="font-size: 14px; color: #1e293b; font-weight: 600; margin-top: 2px;">${issueDate}</div>
                  </td>
                </tr>
                <tr>
                  <td width="50%" style="padding: 6px 12px; vertical-align: top;">
                    <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase;">Due Date</div>
                    <div style="font-size: 14px; color: #1e293b; font-weight: 600; margin-top: 2px;">${dueDate}</div>
                  </td>
                  <td width="50%" style="padding: 6px 12px; vertical-align: top;">
                    <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase;">${isReceipt ? 'Receipt Reference' : 'Payment Status'}</div>
                    <div style="font-size: 14px; color: ${statusColor}; font-weight: 700; margin-top: 2px;">
                      ${paymentInfo?.receiptNo ? paymentInfo.receiptNo : status.replace('_', ' ')}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Line Items Table -->
          <tr>
            <td style="padding: 0 32px 20px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;">
                <thead>
                  <tr style="background-color: #f1f5f9;">
                    <th style="padding: 10px 16px; font-size: 12px; font-weight: 700; color: #475569; text-align: left; text-transform: uppercase;">Item</th>
                    <th style="padding: 10px 16px; font-size: 12px; font-weight: 700; color: #475569; text-align: center; text-transform: uppercase;">HSN/SAC</th>
                    <th style="padding: 10px 16px; font-size: 12px; font-weight: 700; color: #475569; text-align: center; text-transform: uppercase;">Qty</th>
                    <th style="padding: 10px 16px; font-size: 12px; font-weight: 700; color: #475569; text-align: right; text-transform: uppercase;">Rate</th>
                    <th style="padding: 10px 16px; font-size: 12px; font-weight: 700; color: #475569; text-align: right; text-transform: uppercase;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsRows}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Breakdown & Summary -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="40%" style="vertical-align: top; padding-right: 16px;">
                    <div style="font-size: 12px; color: #64748b; line-height: 18px;">
                      <strong>Payment Terms:</strong> Immediate / Online.<br>
                      Official PDF document has been attached to this email for your records.
                    </div>
                  </td>
                  <td width="60%" style="vertical-align: top;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border-radius: 10px; padding: 14px; border: 1px solid #e2e8f0;">
                      <tr>
                        <td style="padding: 4px 0; font-size: 13px; color: #64748b;">Taxable Amount:</td>
                        <td style="padding: 4px 0; font-size: 13px; color: #1e293b; font-weight: 600; text-align: right;">${formatRupees(invoice.subtotal || total / 1.18)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; font-size: 13px; color: #64748b;">CGST (9%):</td>
                        <td style="padding: 4px 0; font-size: 13px; color: #1e293b; font-weight: 600; text-align: right;">${formatRupees(invoice.cgstAmount || (total * 0.18) / 2.36)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; font-size: 13px; color: #64748b;">SGST (9%):</td>
                        <td style="padding: 4px 0; font-size: 13px; color: #1e293b; font-weight: 600; text-align: right;">${formatRupees(invoice.sgstAmount || (total * 0.18) / 2.36)}</td>
                      </tr>
                      <tr style="border-top: 1px solid #cbd5e1;">
                        <td style="padding: 8px 0 4px 0; font-size: 15px; color: #0f172a; font-weight: 700;">Total Amount:</td>
                        <td style="padding: 8px 0 4px 0; font-size: 16px; color: #0f172a; font-weight: 800; text-align: right;">${formatRupees(total)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; font-size: 13px; color: #10b981; font-weight: 600;">Amount Paid:</td>
                        <td style="padding: 4px 0; font-size: 14px; color: #10b981; font-weight: 700; text-align: right;">${formatRupees(paid)}</td>
                      </tr>
                      ${due > 0
      ? `
                      <tr style="border-top: 1px dashed #fca5a5;">
                        <td style="padding: 6px 0 2px 0; font-size: 14px; color: #b91c1c; font-weight: 700;">Balance Due:</td>
                        <td style="padding: 6px 0 2px 0; font-size: 15px; color: #b91c1c; font-weight: 800; text-align: right;">${formatRupees(due)}</td>
                      </tr>`
      : ''
    }
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Download Action Button -->
          ${downloadUrl
      ? `
          <tr>
            <td align="center" style="padding: 8px 32px 32px 32px;">
              <a href="${downloadUrl}" target="_blank" style="display: inline-block; background-color: #0f172a; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 14px 28px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); text-align: center;">
                ⬇️ View & Download PDF Invoice
              </a>
            </td>
          </tr>`
      : ''
    }

          <!-- Footer -->
          <tr>
            <td style="background-color: #0f172a; padding: 24px 32px; color: #94a3b8; font-size: 12px; line-height: 18px; text-align: center; border-top: 1px solid #1e293b;">
              <div style="font-weight: 600; color: #cbd5e1; margin-bottom: 4px;">
                CCTV Security Solutions Private Limited
              </div>
              <div>Need assistance? Email us at <a href="mailto:sahujipriyanshu2112@gmail.com" style="color: #38bdf8; text-decoration: none;">sahujipriyanshu2112@gmail.com</a></div>
              <div style="margin-top: 12px; font-size: 11px; color: #64748b;">
                © ${new Date().getFullYear()} CCTV Security Cloud. All rights reserved. Generated automatically.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

/**
 * Send Tax Invoice Email with PDF Attachment
 */
export async function sendInvoiceEmail({ to, client, invoice, pdfBuffer = null, pdfUrl = null }) {
  const recipient = to || client?.email;
  if (!recipient) {
    logger.warn(`Skipping invoice email delivery: No recipient email provided for invoice [${invoice.invoiceNumber}]`);
    return { skipped: true, reason: 'no_email' };
  }

  const clientName = client?.name || client?.businessName || 'Valued Customer';
  const invNumber = invoice.invoiceNumber || 'INV';
  const downloadUrl = pdfUrl || invoice.pdfUrl || null;

  const html = generateInvoiceHtml({
    clientName,
    invoice,
    downloadUrl,
    isReceipt: invoice.status === 'PAID' && invoice.amountPaid > 0,
  });

  const attachments = [];
  if (pdfBuffer && pdfBuffer.length > 0) {
    attachments.push({
      filename: `${invNumber}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    });
  }

  const transporter = getEmailTransporter();
  const mailOptions = {
    from: env.EMAIL_FROM || 'CCTV Security Solutions <sahujipriyanshu2112@gmail.com>',
    to: recipient,
    subject: `Tax Invoice ${invNumber} — CCTV Security Solutions`,
    html,
    attachments,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`📧 Invoice email sent successfully to ${recipient} [MessageId: ${info.messageId}]`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    logger.error(`❌ Failed to send invoice email to ${recipient}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Send Payment Confirmation Receipt Email
 */
export async function sendPaymentReceiptEmail({ to, client, payment, invoice, pdfBuffer = null, pdfUrl = null }) {
  const recipient = to || client?.email;
  if (!recipient) {
    logger.warn(`Skipping payment receipt email: No recipient email for payment [${payment?._id || payment?.id}]`);
    return { skipped: true, reason: 'no_email' };
  }

  const clientName = client?.name || client?.businessName || 'Valued Customer';
  const invNumber = invoice?.invoiceNumber || 'INV-RECEIPT';
  const downloadUrl = pdfUrl || invoice?.pdfUrl || null;

  const html = generateInvoiceHtml({
    clientName,
    invoice: invoice || {
      invoiceNumber: invNumber,
      totalAmount: payment.amount,
      amountPaid: payment.amount,
      amountDue: 0,
      status: 'PAID',
    },
    downloadUrl,
    isReceipt: true,
    paymentInfo: {
      amount: payment.amount,
      receiptNo: payment.receiptNo,
      method: payment.method,
    },
  });

  const attachments = [];
  if (pdfBuffer && pdfBuffer.length > 0) {
    attachments.push({
      filename: `${invNumber}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    });
  }

  const transporter = getEmailTransporter();
  const mailOptions = {
    from: env.EMAIL_FROM || 'CCTV Security Solutions <sahujipriyanshu2112@gmail.com>',
    to: recipient,
    subject: `Payment Receipt: ${formatRupees(payment.amount)} received (${invNumber})`,
    html,
    attachments,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`📧 Payment receipt email sent successfully to ${recipient} [MessageId: ${info.messageId}]`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    logger.error(`❌ Failed to send payment receipt email to ${recipient}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Generic Custom Email Sender
 */
export async function sendCustomEmail({ to, subject, html, text, attachments = [] }) {
  if (!to || !subject) {
    throw new Error('Recipient email and subject are required');
  }

  const transporter = getEmailTransporter();
  const mailOptions = {
    from: env.EMAIL_FROM || 'CCTV Security Solutions <sahujipriyanshu2112@gmail.com>',
    to,
    subject,
    html,
    text,
    attachments,
  };

  const info = await transporter.sendMail(mailOptions);
  logger.info(`📧 Custom email sent to ${to} [MessageId: ${info.messageId}]`);
  return { success: true, messageId: info.messageId };
}
