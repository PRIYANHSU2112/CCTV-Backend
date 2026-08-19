import Redis from 'ioredis';
import { env } from './env.config.js';
import { logger } from './logger.config.js';

let redisClient = null;

export const createRedisClient = () => {
  if (redisClient) return redisClient;

  const config = {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    db: env.REDIS_DB,
    lazyConnect: true,
    connectTimeout: 10000,
    commandTimeout: 10000,
    enableOfflineQueue: true,
    keepAlive: 10000,
    maxRetriesPerRequest: null,
    retryStrategy(times) {
      const delay = Math.min(times * 100, 3000);
      logger.warn(`Redis connection retry attempt #${times} in ${delay}ms`);
      return delay;
    }
  };

  // Only send password if it is explicitly set and non-empty
  const password = env.REDIS_PASSWORD;
  if (password && password.trim() && password.trim() !== 'undefined') {
    config.password = password.trim();
  }

  redisClient = new Redis(config);

  redisClient.on('connect', () => {
    logger.info('Connected to Redis server successfully');
  });

  redisClient.on('error', (err) => {
    logger.error(`Redis Error: ${err.message}`);
  });

  return redisClient;
};

export const getRedisClient = () => {
  if (!redisClient) {
    return createRedisClient();
  }
  return redisClient;
};
