import {
  toPaise,
  toRupees,
  roundMoney,
  extractGstFromInclusive,
  calculateGstFromExclusive,
  calculateInvoiceTotals,
  buildInvoiceFromInclusiveAmount,
} from '../../shared/utils/money.util.js';

describe('Authoritative Money & GST Calculation Engine', () => {
  // ─── Test 1: Standard 18% Intra-State Calculation from Base ───────────────
  test('Test 1: Subtotal = ₹8,000, GST = 18% -> CGST = ₹720, SGST = ₹720, Total = ₹9,440', () => {
    const result = calculateGstFromExclusive(8000, 18, false);

    expect(result.baseAmount).toBe(8000);
    expect(result.gstAmount).toBe(1440);
    expect(result.cgstAmount).toBe(720);
    expect(result.sgstAmount).toBe(720);
    expect(result.igstAmount).toBe(0);
    expect(result.totalAmount).toBe(9440);
  });

  // ─── Test 2: Balance Due on Partial Payment (₹1,000.02 paid) ──────────────
  test('Test 2: Invoice total = ₹21,240, Paid = ₹1,000.02 -> Balance = ₹20,239.98', () => {
    const total = 21240;
    const paid = 1000.02;
    const balance = roundMoney(total - paid);

    expect(balance).toBe(20239.98);
  });

  // ─── Test 3: Multiple Payments Accumulation & Balance ─────────────────────
  test('Test 3: Invoice total = ₹21,240, Paid = ₹1,000.02, New payment = ₹5,000 -> Total paid = ₹6,000.02, Balance = ₹15,239.98', () => {
    const total = 21240;
    const initialPaid = 1000.02;
    const newPayment = 5000;
    const totalPaid = roundMoney(initialPaid + newPayment);
    const balance = roundMoney(total - totalPaid);

    expect(totalPaid).toBe(6000.02);
    expect(balance).toBe(15239.98);
  });

  // ─── Test 4: Full Payment Status ──────────────────────────────────────────
  test('Test 4: Full payment: Total = ₹9,440, Payment = ₹9,440 -> Balance = ₹0, Status = PAID', () => {
    const totals = calculateInvoiceTotals({
      items: [{ description: 'Quarterly CCTV Plan', unitPrice: 8000, quantity: 1 }],
      taxPercentage: 18,
      amountPaid: 9440,
    });

    expect(totals.subtotal).toBe(8000);
    expect(totals.taxAmount).toBe(1440);
    expect(totals.cgstAmount).toBe(720);
    expect(totals.sgstAmount).toBe(720);
    expect(totals.totalAmount).toBe(9440);
    expect(totals.amountPaid).toBe(9440);
    expect(totals.amountDue).toBe(0);
    expect(totals.status).toBe('PAID');
  });

  // ─── Test 5: Partial Payment Status ───────────────────────────────────────
  test('Test 5: Partial payment: Total = ₹9,440, Payment = ₹5,000 -> Balance = ₹4,440, Status = PARTIALLY_PAID', () => {
    const totals = calculateInvoiceTotals({
      items: [{ description: 'Quarterly CCTV Plan', unitPrice: 8000, quantity: 1 }],
      taxPercentage: 18,
      amountPaid: 5000,
    });

    expect(totals.totalAmount).toBe(9440);
    expect(totals.amountPaid).toBe(5000);
    expect(totals.amountDue).toBe(4440);
    expect(totals.status).toBe('PARTIALLY_PAID');
  });

  // ─── Test 6: Zero Payment (Unpaid Status) ──────────────────────────────────
  test('Test 6: Unpaid invoice: Total = ₹9,440, Paid = 0 -> Status = UNPAID', () => {
    const totals = calculateInvoiceTotals({
      items: [{ description: 'Quarterly CCTV Plan', unitPrice: 8000, quantity: 1 }],
      taxPercentage: 18,
      amountPaid: 0,
    });

    expect(totals.amountDue).toBe(9440);
    expect(totals.status).toBe('UNPAID');
  });

  // ─── Test 7: Extract GST from Inclusive Amount ₹9,440 ─────────────────────
  test('Test 7: Extract GST from inclusive ₹9,440 at 18% -> Base = ₹8,000, CGST = ₹720, SGST = ₹720, Total = ₹9,440', () => {
    const result = extractGstFromInclusive(9440, 18, false);

    expect(result.baseAmount).toBe(8000);
    expect(result.gstAmount).toBe(1440);
    expect(result.cgstAmount).toBe(720);
    expect(result.sgstAmount).toBe(720);
    expect(result.totalAmount).toBe(9440);
    expect(roundMoney(result.baseAmount + result.cgstAmount + result.sgstAmount)).toBe(9440);
  });

  // ─── Test 8: Extract GST from Inclusive Amount ₹21,240 ────────────────────
  test('Test 8: Extract GST from inclusive ₹21,240 at 18% -> Base = ₹18,000, CGST = ₹1,620, SGST = ₹1,620, Total = ₹21,240', () => {
    const result = extractGstFromInclusive(21240, 18, false);

    expect(result.baseAmount).toBe(18000);
    expect(result.gstAmount).toBe(3240);
    expect(result.cgstAmount).toBe(1620);
    expect(result.sgstAmount).toBe(1620);
    expect(result.totalAmount).toBe(21240);
    expect(roundMoney(result.baseAmount + result.cgstAmount + result.sgstAmount)).toBe(21240);
  });

  // ─── Test 9: Integer Paise Conversion ─────────────────────────────────────
  test('Test 9: ₹9,440 = 944000 paise; ₹1,000.02 = 100002 paise', () => {
    expect(toPaise(9440)).toBe(944000);
    expect(toPaise(1000.02)).toBe(100002);
    expect(toPaise(21240)).toBe(2124000);
    expect(toRupees(944000)).toBe(9440);
    expect(toRupees(100002)).toBe(1000.02);
  });

  // ─── Test 10: Inter-State IGST Transaction ────────────────────────────────
  test('Test 10: Inter-state transaction: Base = ₹8,000, IGST = 18% (₹1,440), CGST = 0, SGST = 0', () => {
    const result = calculateGstFromExclusive(8000, 18, true);

    expect(result.baseAmount).toBe(8000);
    expect(result.igstAmount).toBe(1440);
    expect(result.cgstAmount).toBe(0);
    expect(result.sgstAmount).toBe(0);
    expect(result.totalAmount).toBe(9440);
  });

  // ─── Test 11: Floating-Point Edge Cases (e.g. 0.1 + 0.2) ──────────────────
  test('Test 11: Precision safety: 0.1 + 0.2 handles floating-point cleanly', () => {
    const a = 0.1;
    const b = 0.2;
    const sum = roundMoney(a + b);

    expect(sum).toBe(0.3);
    expect(toPaise(a + b)).toBe(30);
  });

  // ─── Test 12: Discount Application with GST ───────────────────────────────
  test('Test 12: Subtotal = ₹10,000, Discount = ₹2,000, Taxable = ₹8,000, 18% GST = ₹1,440 -> Total = ₹9,440', () => {
    const totals = calculateInvoiceTotals({
      items: [{ description: 'CCTV Installation Package', unitPrice: 10000, quantity: 1 }],
      discountAmount: 2000,
      taxPercentage: 18,
      amountPaid: 0,
    });

    expect(totals.subtotal).toBe(10000);
    expect(totals.discountAmount).toBe(2000);
    expect(totals.taxableAmount).toBe(8000);
    expect(totals.taxAmount).toBe(1440);
    expect(totals.cgstAmount).toBe(720);
    expect(totals.sgstAmount).toBe(720);
    expect(totals.totalAmount).toBe(9440);
  });

  // ─── Test 13: Build Invoice Helper from Inclusive Amount ──────────────────
  test('Test 13: buildInvoiceFromInclusiveAmount builds correct line items & tax structure', () => {
    const inv = buildInvoiceFromInclusiveAmount({
      inclusiveAmount: 9440,
      gstRate: 18,
      description: 'Quarterly Plan',
      hsnSac: '998529',
    });

    expect(inv.items[0].unitPrice).toBe(8000);
    expect(inv.items[0].amount).toBe(8000);
    expect(inv.subtotal).toBe(8000);
    expect(inv.taxAmount).toBe(1440);
    expect(inv.cgstAmount).toBe(720);
    expect(inv.sgstAmount).toBe(720);
    expect(inv.totalAmount).toBe(9440);
  });

  // ─── Test 14: Razorpay Amount Consistency ─────────────────────────────────
  test('Test 14: Display = ₹9,440 -> Razorpay order amount = 944000 paise -> Total Invoice = ₹9,440', () => {
    const displayedAmount = 9440;
    const razorpayOrderPaise = toPaise(displayedAmount);
    const invoiceTotals = calculateGstFromExclusive(8000, 18);

    expect(razorpayOrderPaise).toBe(944000);
    expect(invoiceTotals.totalAmount).toBe(displayedAmount);
    expect(toPaise(invoiceTotals.totalAmount)).toBe(razorpayOrderPaise);
  });
});
