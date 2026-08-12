export const subscriptionSwaggerDocs = {
  components: {
    schemas: {
      SubscriptionPlan: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '66b4d32a10e5f2a1b89c2001' },
          name: { type: 'string', example: 'Standard Commercial 8-Camera Plan' },
          planCode: { type: 'string', example: 'STD_8CAM_MONTHLY' },
          packageTier: { type: 'string', enum: ['BASIC', 'STANDARD', 'PREMIUM', 'ENTERPRISE'], example: 'STANDARD' },
          billingCycle: { type: 'string', enum: ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY'], example: 'MONTHLY' },
          durationInMonths: { type: 'integer', example: 1 },
          basePrice: { type: 'number', example: 5000 },
          gstPercentage: { type: 'number', example: 18 },
          totalPrice: { type: 'number', example: 5900 },
          maxCameras: { type: 'integer', example: 8 },
          features: {
            type: 'array',
            items: { type: 'string' },
            example: ['24/7 Live Monitoring', 'HD Stream', 'Auto Renewal']
          },
          autoRenewalSupported: { type: 'boolean', example: true },
          status: { type: 'string', example: 'ACTIVE' }
        }
      },
      CreatePlanPayload: {
        type: 'object',
        required: ['name', 'planCode', 'packageTier', 'billingCycle', 'basePrice', 'maxCameras'],
        properties: {
          name: { type: 'string', example: 'Standard Commercial 8-Camera Plan' },
          planCode: { type: 'string', example: 'STD_8CAM_MONTHLY' },
          packageTier: { type: 'string', enum: ['BASIC', 'STANDARD', 'PREMIUM', 'ENTERPRISE'], example: 'STANDARD' },
          billingCycle: { type: 'string', enum: ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY'], example: 'MONTHLY' },
          basePrice: { type: 'number', example: 5000 },
          maxCameras: { type: 'integer', example: 8 },
          features: { type: 'array', items: { type: 'string' } }
        }
      },
      AssignSubscriptionPayload: {
        type: 'object',
        required: ['clientId', 'planId'],
        properties: {
          clientId: { type: 'string', example: '66b4d32a10e5f2a1b89c1001' },
          planId: { type: 'string', example: '66b4d32a10e5f2a1b89c2001' },
          cameraCount: { type: 'integer', example: 8 }
        }
      }
    }
  },
  paths: {
    '/subscriptions/plans': {
      post: {
        summary: 'Create a new subscription plan',
        tags: ['Subscriptions - Plans'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreatePlanPayload' }
            }
          }
        },
        responses: {
          201: { description: 'Subscription plan created' }
        }
      },
      get: {
        summary: 'List subscription plans with search & package tier filtering',
        tags: ['Subscriptions - Plans'],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'packageTier', in: 'query', schema: { type: 'string' } },
          { name: 'billingCycle', in: 'query', schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Paginated plans list' }
        }
      }
    },
    '/subscriptions/assign': {
      post: {
        summary: 'Assign a plan to a client',
        tags: ['Subscriptions - Client Services'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AssignSubscriptionPayload' }
            }
          }
        },
        responses: {
          201: { description: 'Subscription assigned successfully' }
        }
      }
    },
    '/subscriptions/clients': {
      get: {
        summary: 'List client subscriptions for Admin Panel',
        tags: ['Subscriptions - Client Services'],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Paginated client active subscriptions list' }
        }
      }
    }
  }
};
