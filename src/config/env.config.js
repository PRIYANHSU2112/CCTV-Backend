import dotenv from 'dotenv';
dotenv.config();

/**
 * Centralized Environment Configuration & Validation
 */
export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  API_PREFIX: process.env.API_PREFIX || '/api/v1',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',

  // Database Configuration
  MONGODB_URI: process.env.MONGODB_URI || process.env.DATABASE_URI || 'mongodb+srv://sahujipriyanshu2112_db_user:Priyanshu123@cluster0.srclyqf.mongodb.net/cctv?retryWrites=true&w=majority',

  // Redis Configuration
  REDIS_HOST: process.env.REDIS_HOST || '127.0.0.1',
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',
  REDIS_DB: parseInt(process.env.REDIS_DB || '0', 10),

  // JWT & Security Secrets
  JWT_SECRET: process.env.JWT_SECRET || 'super_secret_jwt_key_change_in_production_12345!',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1d',
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || 'super_secret_refresh_token_key_12345!',
  REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || '12345678901234567890123456789012', // 32 chars for AES-256

  // AWS S3 / DigitalOcean Spaces Storage Configuration
  AWS_ENDPOINT: process.env.AWS_ENDPOINT || process.env.DO_SPACES_ENDPOINT || '',
  AWS_REGION: process.env.AWS_REGION || 'sgp1',
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || '',
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || '',
  AWS_S3_BUCKET: process.env.AWS_S3_BUCKET || 'cctv-backend-storage',

  // Pino Logger
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // Razorpay (secret never exposed to clients)
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || 'rzp_test_SwGnzVleE55oE8',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || 'wg33MCoTYvfPf28NHg5uK6Qi',
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  CHECKOUT_SESSION_TTL_MINUTES: parseInt(process.env.CHECKOUT_SESSION_TTL_MINUTES || '30', 10),

  isDev: (process.env.NODE_ENV || 'development') === 'development',
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test'
};
