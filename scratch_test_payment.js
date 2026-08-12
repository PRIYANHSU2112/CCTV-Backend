import fetch from 'node-fetch';

async function testPayment() {
  try {
    const res = await fetch('http://localhost:5000/api/v1/invoices');
    const json = await res.json();
    console.log('GET /invoices Status:', res.status);
    console.log('Invoices sample:', json.data?.[0]?.invoiceNumber || json.data?.[0]?.id);

    const targetId = json.data?.[0]?.invoiceNumber || 'INV-2026-00001';
    console.log('Testing payment endpoint for targetId:', targetId);

    const payRes = await fetch(`http://localhost:5000/api/v1/invoices/${targetId}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amountPaid: 100,
        paymentMethod: 'Cash',
        notes: 'Test payment via script'
      })
    });

    const payJson = await payRes.json();
    console.log('POST /payments Status:', payRes.status);
    console.log('POST /payments Response:', payJson);
  } catch (err) {
    console.error('Test error:', err.message);
  }
}

testPayment();
