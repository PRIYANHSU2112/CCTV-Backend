/**
 * OpenAPI 3.0 Documentation for Client Module
 */
export const clientSwaggerDocs = {
  paths: {
    '/api/v1/clients': {
      post: {
        tags: ['Client Management'],
        summary: 'Onboard a new Client',
        description: 'Creates a User Auth Account and Client Profile simultaneously.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'phone', 'businessName', 'address', 'city', 'pincode'],
                properties: {
                  name: { type: 'string', example: 'Satya Prakash' },
                  phone: { type: 'string', example: '9876543210' },
                  email: { type: 'string', example: 'satya@example.com' },
                  businessName: { type: 'string', example: 'Sharma Electronics' },
                  gstin: { type: 'string', example: '23AAAAA0000A1Z5' },
                  address: { type: 'string', example: '123 Commercial Complex, MP Nagar' },
                  city: { type: 'string', example: 'Bhopal' },
                  pincode: { type: 'string', example: '462011' },
                  state: { type: 'string', example: 'Madhya Pradesh' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Client onboarded successfully' },
          400: { description: 'Validation error' },
          409: { description: 'Client phone number already exists' }
        }
      },
      get: {
        tags: ['Client Management'],
        summary: 'List paginated clients',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'city', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['Active', 'Due', 'Overdue', 'Suspended'] } }
        ],
        responses: {
          200: { description: 'Paginated client list returned successfully' }
        }
      }
    },
    '/api/v1/clients/stats': {
      get: {
        tags: ['Client Management'],
        summary: 'Client list KPI statistics',
        responses: {
          200: { description: 'Client stats for dashboard cards' }
        }
      }
    },
    '/api/v1/clients/{id}/dashboard': {
      get: {
        tags: ['Client Management'],
        summary: 'Client detail dashboard',
        description:
          'Returns client profile, KPIs, subscriptions, and activity for the admin client detail page.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Client dashboard payload' },
          404: { description: 'Client not found' }
        }
      }
    },
    '/api/v1/clients/{id}': {
      get: {
        tags: ['Client Management'],
        summary: 'Get client details by ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Client details' },
          404: { description: 'Client not found' }
        }
      },
      put: {
        tags: ['Client Management'],
        summary: 'Update client details',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Client updated successfully' }
        }
      },
      delete: {
        tags: ['Client Management'],
        summary: 'Delete client',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Client deleted' }
        }
      }
    }
  }
};
