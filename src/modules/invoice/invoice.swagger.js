export const invoiceSwaggerDocs = {
  name: 'Invoice Module',
  description: 'Invoice Generation & PDF Streaming Endpoints',
  paths: {
    '/api/v1/invoices': {
      post: {
        tags: ['Invoices'],
        summary: 'Create a new Invoice',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['clientId', 'dueDate', 'items'],
                properties: {
                  clientId: { type: 'string', example: '665a1b2c3d4e5f6a7b8c9d0e' },
                  subscriptionId: { type: 'string', example: '665a1b2c3d4e5f6a7b8c9d0f' },
                  dueDate: { type: 'string', format: 'date-time', example: '2026-09-01T00:00:00.000Z' },
                  taxPercentage: { type: 'number', example: 18 },
                  discountAmount: { type: 'number', example: 0 },
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['description', 'quantity', 'unitPrice'],
                      properties: {
                        description: { type: 'string', example: 'CCTV Camera Installation & Maintenance' },
                        quantity: { type: 'number', example: 2 },
                        unitPrice: { type: 'number', example: 1500 }
                      }
                    }
                  },
                  notes: { type: 'string', example: 'Payment due within 15 days.' }
                }
              }
            }
          }
        },
        responses: {
          211: { description: 'Invoice created successfully' },
          400: { description: 'Bad Request / Validation Error' }
        }
      },
      get: {
        tags: ['Invoices'],
        summary: 'List Paginated Invoices',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'clientId', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Paginated invoices list fetched successfully' }
        }
      }
    },
    '/api/v1/invoices/{id}': {
      get: {
        tags: ['Invoices'],
        summary: 'Get Invoice Details by ID',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Invoice details fetched successfully' },
          404: { description: 'Invoice not found' }
        }
      }
    },
    '/api/v1/invoices/{id}/pdf': {
      get: {
        tags: ['Invoices'],
        summary: 'Download Invoice PDF',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: {
            description: 'PDF Stream returned (application/pdf)',
            content: {
              'application/pdf': {
                schema: { type: 'string', format: 'binary' }
              }
            }
          },
          404: { description: 'Invoice not found' }
        }
      }
    }
  }
};
