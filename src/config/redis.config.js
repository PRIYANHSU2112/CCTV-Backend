import Redis from 'ioredis';
import { env } from './env.config.js';
import { logger } from './logger.config.js';

let redisClient = null;

export const createRedisClient = () => {
  if (redisClient) return redisClient;

  redisClient = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    db: env.REDIS_DB,
    lazyConnect: true,
    commandTimeout: 100,
    connectTimeout: 2000,
    enableOfflineQueue: false,
    keepAlive: 10000,
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 100, 3000);
      logger.warn(`Redis connection retry attempt #${times} in ${delay}ms`);
      return delay;
    }
  });

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
