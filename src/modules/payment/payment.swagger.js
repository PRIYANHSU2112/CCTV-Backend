export const paymentSwaggerDocs = {
  components: {
    schemas: {
      PaymentTransaction: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '66b4d32a10e5f2a1b89c3001' },
          clientId: { type: 'string', example: '66b4d32a10e5f2a1b89c1001' },
          subscriptionId: { type: 'string', nullable: true },
          invoiceId: { type: 'string', nullable: true, example: 'INV-1001' },
          amount: { type: 'number', example: 2799 },
          method: {
            type: 'string',
            enum: ['UPI', 'BANK_TRANSFER', 'CASH', 'GATEWAY'],
            example: 'UPI',
          },
          status: {
            type: 'string',
            enum: ['PAID', 'PARTIAL', 'PENDING', 'FAILED'],
            example: 'PAID',
          },
          paidAt: { type: 'string', format: 'date-time' },
          receiptNo: { type: 'string', example: 'RCPT-20260808-4821' },
          note: { type: 'string', example: 'Monthly subscription payment' },
          businessName: { type: 'string', example: 'Sharma Electronics' },
          clientName: { type: 'string', example: 'Satya Prakash' },
        },
      },
      RecordPaymentPayload: {
        type: 'object',
        required: ['clientId', 'amount', 'method'],
        properties: {
          clientId: { type: 'string', example: '66b4d32a10e5f2a1b89c1001' },
          amount: { type: 'number', example: 2799 },
          method: {
            type: 'string',
            enum: ['UPI', 'BANK_TRANSFER', 'CASH', 'GATEWAY'],
            example: 'UPI',
          },
          status: {
            type: 'string',
            enum: ['PAID', 'PARTIAL', 'PENDING', 'FAILED'],
            example: 'PAID',
          },
          invoiceId: { type: 'string', example: 'INV-1001' },
          note: { type: 'string', example: 'Collected at office' },
          paidAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateCheckoutSessionPayload: {
        type: 'object',
        required: ['planId', 'name', 'phone', 'businessName', 'address', 'city', 'pincode'],
        properties: {
          planId: { type: 'string', example: '66b4d32a10e5f2a1b89c2001' },
          name: { type: 'string', example: 'Satya Prakash' },
          phone: { type: 'string', example: '9876543210' },
          email: { type: 'string', example: 'satya@example.com' },
          businessName: { type: 'string', example: 'Sharma Electronics' },
          address: { type: 'string', example: 'Shop 12, Main Market' },
          city: { type: 'string', example: 'Indore' },
          pincode: { type: 'string', example: '452001' },
          gstin: { type: 'string', example: '23AABCS1234D1Z5' },
          state: { type: 'string', example: 'Madhya Pradesh' },
        },
      },
      VerifyCheckoutPayload: {
        type: 'object',
        required: ['sessionId', 'razorpay_order_id', 'razorpay_payment_id', 'razorpay_signature'],
        properties: {
          sessionId: { type: 'string', example: 'a1b2c3d4e5f67890a1b2c3d4e5f67890' },
          razorpay_order_id: { type: 'string', example: 'order_NXg9A8Z12345' },
          razorpay_payment_id: { type: 'string', example: 'pay_NXg9B7X98765' },
          razorpay_signature: { type: 'string', example: 'c6a2b8e91234567890abcdef' },
        },
      },
      FailCheckoutPayload: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string', example: 'a1b2c3d4e5f67890a1b2c3d4e5f67890' },
          reason: { type: 'string', example: 'User cancelled payment modal' },
        },
      },
    },
  },
  paths: {
    '/payments/gateway/config': {
      get: {
        summary: 'Public Razorpay key id only',
        tags: ['Payments - Checkout'],
        responses: { 200: { description: 'Gateway public config' } },
      },
    },
    '/payments/checkout/sessions': {
      post: {
        summary: 'Create ACID checkout: pending subscription + payment + Razorpay order',
        tags: ['Payments - Checkout'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateCheckoutSessionPayload' },
            },
          },
        },
        responses: {
          201: { description: 'Checkout session created' },
          400: { description: 'Validation or plan error' },
        },
      },
    },
    '/payments/checkout/verify': {
      post: {
        summary: 'Verify Razorpay signature and ACID-activate subscription',
        tags: ['Payments - Checkout'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/VerifyCheckoutPayload' },
            },
          },
        },
        responses: {
          200: { description: 'Payment verified' },
          400: { description: 'Invalid signature or session' },
        },
      },
    },
    '/payments/checkout/fail': {
      post: {
        summary: 'Mark checkout failed (cancel unpaid booking)',
        tags: ['Payments - Checkout'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/FailCheckoutPayload' },
            },
          },
        },
        responses: { 200: { description: 'Marked failed' } },
      },
    },
    '/payments/webhooks/razorpay': {
      post: {
        summary: 'Razorpay webhook (signature verified)',
        tags: ['Payments - Checkout'],
        responses: { 200: { description: 'Webhook handled' } },
      },
    },
    '/payments': {
      post: {
        summary: 'Record a payment transaction',
        tags: ['Payments'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RecordPaymentPayload' },
            },
          },
        },
        responses: {
          201: { description: 'Payment recorded' },
          400: { description: 'Validation error' },
          404: { description: 'Client not found' },
        },
      },
      get: {
        summary: 'List payment transactions (history)',
        tags: ['Payments'],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'method', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'clientId', in: 'query', schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          200: { description: 'Paginated payment history' },
        },
      },
    },
    '/payments/summary': {
      get: {
        summary: 'Payment KPI summary',
        tags: ['Payments'],
        responses: {
          200: { description: 'Aggregated payment summary' },
        },
      },
    },
    '/payments/{id}': {
      get: {
        summary: 'Get payment receipt by id',
        tags: ['Payments'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Payment detail' },
          404: { description: 'Payment not found' },
        },
      },
    },
    '/payments/clients/{clientId}': {
      get: {
        summary: 'List payments for a client',
        tags: ['Payments'],
        parameters: [
          { name: 'clientId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: { description: 'Client payment history' },
          404: { description: 'Client not found' },
        },
      },
    },
  },
};
