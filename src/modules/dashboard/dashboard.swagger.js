/**
 * OpenAPI / Swagger Specification for Dashboard Module
 */
export const dashboardSwaggerDocs = {
  '/dashboard/stats': {
    get: {
      tags: ['Dashboard'],
      summary: 'Get full Operations Dashboard overview',
      description: 'Retrieves complete dashboard metrics including KPIs, graph analytics, and recent payments.',
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Dashboard statistics retrieved successfully' },
        401: { description: 'Unauthorized — Missing token' },
        403: { description: 'Forbidden — Missing dashboard:view permission' }
      }
    }
  },
  '/dashboard/kpis': {
    get: {
      tags: ['Dashboard'],
      summary: 'Get executive KPIs summary',
      description: 'Retrieves executive KPIs (total clients, active clients, suspended clients, due payments, monthly revenue, upcoming renewals).',
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Executive KPIs retrieved successfully' },
        401: { description: 'Unauthorized' },
        403: { description: 'Forbidden' }
      }
    }
  },
  '/dashboard/charts': {
    get: {
      tags: ['Dashboard'],
      summary: 'Get all graph & chart analytics data',
      description: 'Retrieves revenue series, collection vs outstanding, plan distribution, method mix, payment aging buckets, and renewal pipeline.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'months',
          in: 'query',
          schema: { type: 'integer', default: 6 },
          description: 'Number of historical months for revenue trend'
        }
      ],
      responses: {
        200: { description: 'Chart analytics retrieved successfully' },
        401: { description: 'Unauthorized' },
        403: { description: 'Forbidden' }
      }
    }
  },
  '/dashboard/recent-payments': {
    get: {
      tags: ['Dashboard'],
      summary: 'Get paginated, searchable & filterable recent payments feed',
      description: 'Retrieves recent payment transactions with full pagination, text search across client name, business name, receipt number, or order ID, and status/method filters.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by receipt number, client name, business name, order ID' },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['PAID', 'FAILED', 'PENDING'] } },
        { name: 'paymentMethod', in: 'query', schema: { type: 'string', enum: ['GATEWAY', 'UPI', 'BANK_TRANSFER', 'CASH'] } },
        { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' } }
      ],
      responses: {
        200: { description: 'Recent payments feed retrieved successfully' },
        401: { description: 'Unauthorized' },
        403: { description: 'Forbidden' }
      }
    }
  }
};
