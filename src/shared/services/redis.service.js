import { logger } from '../../config/logger.config.js';

export class RedisService {
  constructor({ redisClient }) {
    this.client = redisClient;
  }

  async get(key) {
    try {
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      logger.error(`Redis Service Get Error for key [${key}]: ${err.message}`);
      return null;
    }
  }

  async set(key, value, ttlSeconds = 3600) {
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        await this.client.set(key, serialized, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, serialized);
      }
      return true;
    } catch (err) {
      logger.error(`Redis Service Set Error for key [${key}]: ${err.message}`);
      return false;
    }
  }

  async del(key) {
    try {
      await this.client.del(key);
      return true;
    } catch (err) {
      logger.error(`Redis Service Delete Error for key [${key}]: ${err.message}`);
      return false;
    }
  }

  async exists(key) {
    try {
      const count = await this.client.exists(key);
      return count > 0;
    } catch (err) {
      logger.error(`Redis Service Exists Error for key [${key}]: ${err.message}`);
      return false;
    }
  }
}
