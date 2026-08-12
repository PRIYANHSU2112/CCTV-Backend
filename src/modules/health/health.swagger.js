export const healthSwaggerDocs = {
  paths: {
    '/health': {
      get: {
        summary: 'Liveness probe check',
        tags: ['Health'],
        responses: {
          200: { description: 'Server process is alive' }
        }
      }
    },
    '/ready': {
      get: {
        summary: 'Readiness probe check (MongoDB & Redis status)',
        tags: ['Health'],
        responses: {
          200: { description: 'All database and cache services connected' },
          500: { description: 'One or more required infrastructure services unavailable' }
        }
      }
    }
  }
};
