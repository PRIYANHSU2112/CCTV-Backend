import mongoose from 'mongoose';

export class HealthService {
  constructor({ redisService }) {
    this.redisService = redisService;
  }

  getLivenessStatus() {
    return {
      status: 'UP',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };
  }

  async getReadinessStatus() {
    const mongoStatus = mongoose.connection.readyState === 1 ? 'UP' : 'DOWN';
    let redisStatus = 'DOWN';

    try {
      if (this.redisService) {
        const ping = await this.redisService.exists('health_check_ping');
        redisStatus = ping !== null ? 'UP' : 'DOWN';
      }
    } catch {
      redisStatus = 'DOWN';
    }

    const isReady = mongoStatus === 'UP' && redisStatus === 'UP';

    return {
      status: isReady ? 'UP' : 'DOWN',
      timestamp: new Date().toISOString(),
      checks: {
        database: mongoStatus,
        cache: redisStatus
      }
    };
  }
}
