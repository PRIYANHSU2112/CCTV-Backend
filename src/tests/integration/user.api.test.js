import request from 'supertest';
import { createApp } from '../../app.js';

describe('User & Health API Endpoints (Integration Tests)', () => {
  let app;
  let redisClient;

  beforeAll(async () => {
    const initialized = await createApp();
    app = initialized.app;
    redisClient = initialized.redisClient;
  });

  afterAll(async () => {
    if (redisClient) {
      try {
        await redisClient.quit();
      } catch (err) {
        // Safe catch for mock/disconnected redis in tests
      }
    }
  });

  describe('GET /api/v1/health', () => {
    it('should return 200 OK and liveness status', async () => {
      const res = await request(app).get('/api/v1/health');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('status', 'UP');
      expect(res.headers).toHaveProperty('x-request-id');
    });
  });

  describe('POST /api/v1/users/register', () => {
    it('should return 400 validation error if payload is invalid', async () => {
      const payload = {
        name: 'Short Pwd User',
        email: 'short@example.com',
        password: '123'
      };

      const res = await request(app)
        .post('/api/v1/users/register')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body).toHaveProperty('meta');
      expect(res.body.meta).toHaveProperty('requestId');
    });
  });
});
