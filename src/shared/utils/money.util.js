/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTHORITATIVE MONEY & GST CALCULATION ENGINE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * SINGLE SOURCE OF TRUTH for all financial calculations in the application.
 *
 * Rules:
 *   1. All internal calculations use integer PAISE to avoid floating-point drift.
 *   2. All public API returns Rupee values (rounded to 2 decimal places).
 *   3. Every service that needs GST/amount math MUST import from here.
 *   4. Never duplicate these formulas in controllers, workers, or templates.
 *
 * GST model:
 *   - Intra-state → CGST (half rate) + SGST (half rate)
 *   - Inter-state → IGST (full rate)
 *   - Default: intra-state (Madhya Pradesh)
 */

// ─── Safe Conversion Helpers ─────────────────────────────────────────────────

/**
 * Convert Rupees to Paise (integer). Avoids floating-point issues.
 * @param {number} rupees
 * @returns {number} paise (integer)
 */
export function toPaise(rupees) {
  if (rupees === null || rupees === undefined || isNaN(rupees)) return 0;
  return Math.round(Number(rupees) * 100);
}

/**
 * Convert Paise to Rupees (2 decimal places).
 * @param {number} paise
 * @returns {number} rupees
 */
export function toRupees(paise) {
  if (paise === null || paise === undefined || isNaN(paise)) return 0;
  return Math.round(Number(paise)) / 100;
}

/**
 * Round a Rupee amount to 2 decimal places.
 * @param {number} rupees
 * @returns {number}
 */
export function roundMoney(rupees) {
  if (rupees === null || rupees === undefined || isNaN(rupees)) return 0;
  return Math.round(Number(rupees) * 100) / 100;
}

/**
 * Format Rupee amount to Indian Currency string (e.g. ₹18,000.00)
 * @param {number} amount
 * @returns {string}
 */
export function formatRupees(amount) {
  const num = Number(amount) || 0;
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── GST Extraction ──────────────────────────────────────────────────────────

/**
 * Extract GST components from a GST-INCLUSIVE amount.
 *
 * Example:
 *   inclusiveAmount = ₹9,440, gstRate = 18
 *   → base = ₹8,000, gst = ₹1,440, cgst = ₹720, sgst = ₹720
 *
 * @param {number} inclusiveAmount - GST-inclusive amount in Rupees
 * @param {number} gstRate - GST percentage (e.g. 18)
 * @param {boolean} isInterState - true for IGST, false for CGST+SGST
 * @returns {{ baseAmount, gstAmount, cgstAmount, sgstAmount, igstAmount, totalAmount }}
 */
export function extractGstFromInclusive(inclusiveAmount, gstRate = 18, isInterState = false) {
  const inclusivePaise = toPaise(inclusiveAmount);
  const rate = Number(gstRate) || 0;

  if (rate <= 0) {
    return {
      baseAmount: toRupees(inclusivePaise),
      gstAmount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      totalAmount: toRupees(inclusivePaise),
      taxPercentage: 0,
    };
  }

  // base = inclusive / (1 + rate/100)
  const basePaise = Math.round(inclusivePaise / (1 + rate / 100));
  const gstPaise = inclusivePaise - basePaise;

  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;

  if (isInterState) {
    igstPaise = gstPaise;
  } else {
    // Split evenly — round down cgst, remainder goes to sgst for exact sum
    cgstPaise = Math.floor(gstPaise / 2);
    sgstPaise = gstPaise - cgstPaise;
  }

  return {
    baseAmount: toRupees(basePaise),
    gstAmount: toRupees(gstPaise),
    cgstAmount: toRupees(cgstPaise),
    sgstAmount: toRupees(sgstPaise),
    igstAmount: toRupees(igstPaise),
    totalAmount: toRupees(inclusivePaise),
    taxPercentage: rate,
  };
}

/**
 * Calculate GST components from a PRE-TAX (exclusive) base amount.
 *
 * Example:
 *   baseAmount = ₹8,000, gstRate = 18
 *   → gst = ₹1,440, cgst = ₹720, sgst = ₹720, total = ₹9,440
 *
 * @param {number} baseAmount - Pre-tax amount in Rupees
 * @param {number} gstRate - GST percentage (e.g. 18)
 * @param {boolean} isInterState - true for IGST, false for CGST+SGST
 * @returns {{ baseAmount, gstAmount, cgstAmount, sgstAmount, igstAmount, totalAmount }}
 */
export function calculateGstFromExclusive(baseAmount, gstRate = 18, isInterState = false) {
  const basePaise = toPaise(baseAmount);
  const rate = Number(gstRate) || 0;

  if (rate <= 0) {
    return {
      baseAmount: toRupees(basePaise),
      gstAmount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      totalAmount: toRupees(basePaise),
      taxPercentage: 0,
    };
  }

  const gstPaise = Math.round(basePaise * rate / 100);
  const totalPaise = basePaise + gstPaise;

  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;

  if (isInterState) {
    igstPaise = gstPaise;
  } else {
    cgstPaise = Math.floor(gstPaise / 2);
    sgstPaise = gstPaise - cgstPaise;
  }

  return {
    baseAmount: toRupees(basePaise),
    gstAmount: toRupees(gstPaise),
    cgstAmount: toRupees(cgstPaise),
    sgstAmount: toRupees(sgstPaise),
    igstAmount: toRupees(igstPaise),
    totalAmount: toRupees(totalPaise),
    taxPercentage: rate,
  };
}

// ─── Invoice Totals Calculator ───────────────────────────────────────────────

/**
 * Calculate complete invoice totals from line items.
 *
 * Each item must have: { unitPrice, quantity }
 * GST is applied on the computed subtotal.
 *
 * @param {Object} params
 * @param {Array<{unitPrice: number, quantity: number}>} params.items - Line items (pre-tax unit prices)
 * @param {number} [params.taxPercentage=18] - GST rate
 * @param {number} [params.discountAmount=0] - Flat discount in Rupees
 * @param {number} [params.amountPaid=0] - Amount already paid
 * @param {boolean} [params.isInterState=false] - IGST vs CGST+SGST
 * @returns {Object} Complete invoice totals
 */
export function calculateInvoiceTotals({
  items = [],
  taxPercentage = 18,
  discountAmount = 0,
  amountPaid = 0,
  isInterState = false,
}) {
  // Sum item amounts (each item amount = unitPrice × quantity)
  let subtotalPaise = 0;
  const computedItems = items.map((item) => {
    const qty = Math.max(1, Number(item.quantity) || 1);
    const unitPricePaise = toPaise(item.unitPrice || 0);
    const itemAmountPaise = unitPricePaise * qty;
    subtotalPaise += itemAmountPaise;
    return {
      ...item,
      quantity: qty,
      unitPrice: toRupees(unitPricePaise),
      amount: toRupees(itemAmountPaise),
    };
  });

  const discountPaise = toPaise(discountAmount);
  const taxableAmountPaise = Math.max(0, subtotalPaise - discountPaise);

  const rate = Number(taxPercentage) || 0;
  const gstPaise = Math.round(taxableAmountPaise * rate / 100);
  const totalAmountPaise = taxableAmountPaise + gstPaise;
  const amountPaidPaise = toPaise(amountPaid);
  const amountDuePaise = Math.max(0, totalAmountPaise - amountPaidPaise);

  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;

  if (isInterState) {
    igstPaise = gstPaise;
  } else {
    cgstPaise = Math.floor(gstPaise / 2);
    sgstPaise = gstPaise - cgstPaise;
  }

  // Determine payment status
  let status;
  if (amountPaidPaise <= 0) {
    status = 'UNPAID';
  } else if (amountDuePaise <= 0) {
    status = 'PAID';
  } else {
    status = 'PARTIALLY_PAID';
  }

  return {
    items: computedItems,
    subtotal: toRupees(subtotalPaise),
    discountAmount: toRupees(discountPaise),
    taxableAmount: toRupees(taxableAmountPaise),
    taxPercentage: rate,
    taxAmount: toRupees(gstPaise),
    cgstAmount: toRupees(cgstPaise),
    sgstAmount: toRupees(sgstPaise),
    igstAmount: toRupees(igstPaise),
    totalAmount: toRupees(totalAmountPaise),
    amountPaid: toRupees(amountPaidPaise),
    amountDue: toRupees(amountDuePaise),
    status,
    // Paise equivalents for payment gateways
    subtotalPaise,
    totalAmountPaise,
    amountPaidPaise,
    amountDuePaise,
  };
}

/**
 * Build invoice data from a GST-inclusive payment amount.
 *
 * Used when a payment has already been made (e.g. website checkout)
 * and we need to create an invoice that correctly shows the GST breakdown.
 *
 * @param {Object} params
 * @param {number} params.inclusiveAmount - The GST-inclusive amount paid
 * @param {number} [params.gstRate=18] - GST percentage
 * @param {string} [params.description] - Line item description
 * @param {string} [params.hsnSac='998529'] - HSN/SAC code
 * @param {boolean} [params.isInterState=false]
 * @returns {Object} Invoice-ready data with correct GST breakdown
 */
export function buildInvoiceFromInclusiveAmount({
  inclusiveAmount,
  gstRate = 18,
  description = 'CCTV Security Subscription',
  hsnSac = '998529',
  isInterState = false,
}) {
  const gst = extractGstFromInclusive(inclusiveAmount, gstRate, isInterState);

  return {
    items: [
      {
        description,
        hsnSac,
        quantity: 1,
        unitPrice: gst.baseAmount,
        amount: gst.baseAmount,
      },
    ],
    subtotal: gst.baseAmount,
    taxPercentage: gst.taxPercentage,
    taxAmount: gst.gstAmount,
    cgstAmount: gst.cgstAmount,
    sgstAmount: gst.sgstAmount,
    igstAmount: gst.igstAmount,
    totalAmount: gst.totalAmount,
  };
}
