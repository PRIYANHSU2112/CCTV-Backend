export const reminderSwaggerDocs = {
  name: 'Reminder Module',
  description: 'Automated & BullMQ Background Job Reminder Endpoints',
  paths: {
    '/api/v1/reminders': {
      post: {
        tags: ['Reminders'],
        summary: 'Create & schedule a new Reminder rule (BullMQ background job)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'channels', 'messageTemplate', 'scheduledFor'],
                properties: {
                  title: { type: 'string', example: 'Upcoming Payment Reminder' },
                  clientId: { type: 'string', example: '665a1b2c3d4e5f6a7b8c9d0e' },
                  channels: {
                    type: 'array',
                    items: { type: 'string', enum: ['SMS', 'WhatsApp', 'Email', 'Push'] },
                    example: ['WhatsApp', 'SMS']
                  },
                  messageTemplate: { type: 'string', example: 'Hello {{clientName}}, your payment is due on {{dueDate}}.' },
                  isRecurring: { type: 'boolean', example: true },
                  repeatEveryDays: { type: 'number', example: 3 },
                  scheduledFor: { type: 'string', format: 'date-time', example: '2026-08-15T09:00:00.000Z' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Reminder created and scheduled in BullMQ' },
          400: { description: 'Validation Error' }
        }
      },
      get: {
        tags: ['Reminders'],
        summary: 'List paginated Reminder rules',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['Active', 'Paused', 'Completed', 'Cancelled'] } },
          { name: 'search', in: 'query', schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Paginated list of reminder rules' }
        }
      }
    },
    '/api/v1/reminders/logs': {
      get: {
        tags: ['Reminders'],
        summary: 'List paginated Reminder execution audit logs',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['Queued', 'Processing', 'Sent', 'Failed'] } },
          { name: 'channel', in: 'query', schema: { type: 'string', enum: ['SMS', 'WhatsApp', 'Email', 'Push'] } }
        ],
        responses: {
          200: { description: 'Paginated execution logs' }
        }
      }
    },
    '/api/v1/reminders/{id}/pause': {
      patch: {
        tags: ['Reminders'],
        summary: 'Pause a reminder and cancel BullMQ background job',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Reminder paused and BullMQ job removed' }
        }
      }
    },
    '/api/v1/reminders/{id}/resume': {
      patch: {
        tags: ['Reminders'],
        summary: 'Resume a reminder and reschedule in BullMQ',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Reminder resumed and job rescheduled' }
        }
      }
    },
    '/api/v1/reminders/{id}': {
      put: {
        tags: ['Reminders'],
        summary: 'Update & reschedule a reminder rule',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  messageTemplate: { type: 'string' },
                  repeatEveryDays: { type: 'number' },
                  scheduledFor: { type: 'string', format: 'date-time' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Reminder updated & rescheduled' }
        }
      },
      delete: {
        tags: ['Reminders'],
        summary: 'Delete a reminder and remove from BullMQ',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Reminder rule deleted' }
        }
      }
    }
  }
};
