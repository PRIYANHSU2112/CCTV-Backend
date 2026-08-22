export const searchSwaggerDocs = {
  '/search': {
    get: {
      tags: ['Search'],
      summary: 'Global High-Performance Multi-Entity Search',
      description: 'Search across clients, invoices, payments, subscriptions, plans, users, and navigation shortcuts.',
      parameters: [
        {
          name: 'q',
          in: 'query',
          required: true,
          schema: { type: 'string', minLength: 1, maxLength: 100 },
          description: 'Search query string',
        },
        {
          name: 'limit',
          in: 'query',
          required: false,
          schema: { type: 'integer', default: 5, minimum: 1, maximum: 20 },
          description: 'Max items per category',
        },
        {
          name: 'type',
          in: 'query',
          required: false,
          schema: { type: 'string', enum: ['all', 'clients', 'invoices', 'payments', 'subscriptions', 'users'], default: 'all' },
          description: 'Category filter',
        },
      ],
      responses: {
        200: {
          description: 'Search results grouped by entity type',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Fetched successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      nav: { type: 'array' },
                      clients: { type: 'array' },
                      invoices: { type: 'array' },
                      payments: { type: 'array' },
                      subscriptions: { type: 'array' },
                      plans: { type: 'array' },
                      users: { type: 'array' },
                    },
                  },
                  meta: {
                    type: 'object',
                    properties: {
                      query: { type: 'string' },
                      totalMatches: { type: 'number' },
                      tookMs: { type: 'number' },
                      cached: { type: 'boolean' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};
