/**
 * Notification Module OpenAPI / Swagger Specifications
 * @openapi
 */
export const notificationSwaggerDocs = {
  components: {
    schemas: {
      Notification: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '66b4d32a10e5f2a1b89c2001' },
          recipient: { type: 'string', example: '66b4d32a10e5f2a1b89c1001' },
          title: { type: 'string', example: 'Payment Received' },
          message: { type: 'string', example: 'Payment of ₹1,500 received for Invoice INV-2026-001' },
          type: { type: 'string', example: 'PAYMENT' },
          priority: { type: 'string', example: 'MEDIUM' },
          channel: { type: 'string', example: 'IN_APP' },
          actionUrl: { type: 'string', example: '/invoices/inv_123' },
          metadata: { type: 'object', example: { invoiceNumber: 'INV-2026-001', amount: 1500 } },
          isRead: { type: 'boolean', example: false },
          readAt: { type: 'string', format: 'date-time', example: null },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      SendNotificationPayload: {
        type: 'object',
        required: ['recipient', 'title', 'message'],
        properties: {
          recipient: { type: 'string', description: 'User ID of the recipient' },
          title: { type: 'string' },
          message: { type: 'string' },
          type: { type: 'string', enum: ['SYSTEM', 'PAYMENT', 'SUBSCRIPTION', 'INVOICE', 'REMINDER', 'SECURITY', 'ALERT'] },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
          actionUrl: { type: 'string' },
          metadata: { type: 'object' }
        }
      },
      BroadcastNotificationPayload: {
        type: 'object',
        required: ['recipientIds', 'title', 'message'],
        properties: {
          recipientIds: { type: 'array', items: { type: 'string' } },
          title: { type: 'string' },
          message: { type: 'string' },
          type: { type: 'string' },
          priority: { type: 'string' }
        }
      }
    }
  },
  paths: {
    '/notifications': {
      post: {
        summary: 'Send Notification to a User',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SendNotificationPayload' } } } },
        responses: { 201: { description: 'Notification sent' }, 401: { description: 'Unauthorized' }, 403: { description: 'Forbidden' } }
      }
    },
    '/notifications/broadcast': {
      post: {
        summary: 'Broadcast Notification to Multiple Users',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/BroadcastNotificationPayload' } } } },
        responses: { 201: { description: 'Broadcast sent' }, 401: { description: 'Unauthorized' }, 403: { description: 'Forbidden' } }
      }
    },
    '/notifications/me': {
      get: {
        summary: 'Get My Notifications (Paginated)',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'isRead', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } }
        ],
        responses: { 200: { description: 'Paginated notifications' }, 401: { description: 'Unauthorized' } }
      }
    },
    '/notifications/me/unread-count': {
      get: {
        summary: 'Get Unread Notification Count',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Unread count object' }, 401: { description: 'Unauthorized' } }
      }
    },
    '/notifications/me/read-all': {
      patch: {
        summary: 'Mark All Notifications as Read',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'All marked as read' }, 401: { description: 'Unauthorized' } }
      }
    },
    '/notifications/me/read': {
      delete: {
        summary: 'Clear All Read Notifications',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Read notifications cleared' }, 401: { description: 'Unauthorized' } }
      }
    },
    '/notifications/{id}/read': {
      patch: {
        summary: 'Mark Single Notification as Read',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Notification marked as read' }, 404: { description: 'Not found' } }
      }
    },
    '/notifications/{id}': {
      delete: {
        summary: 'Delete a Notification',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Notification deleted' }, 404: { description: 'Not found' } }
      }
    }
  }
};
