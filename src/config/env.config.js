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
  MONGODB_URI: process.env.MONGODB_URI || process.env.DATABASE_URI || 'mongodb+srv://saburicctv998529_db_user:nZQw7hTTS0inYRDo@saburi.wd7ye8q.mongodb.net/?appName=saburi',

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

  // AWS S3 / DigitalOcean Spaces / Linode Object Storage Configuration
  AWS_ENDPOINT: process.env.LINODE_OBJECT_STORAGE_ENDPOINT || process.env.AWS_ENDPOINT || process.env.DO_SPACES_ENDPOINT || 'https://sgp1.digitaloceanspaces.com',
  AWS_REGION: process.env.LINODE_OBJECT_STORAGE_REGION || process.env.AWS_REGION || 'sgp1',
  AWS_ACCESS_KEY_ID: process.env.LINODE_OBJECT_STORAGE_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || 'DO003NRRKMN4DTETPLGA',
  AWS_SECRET_ACCESS_KEY: process.env.LINODE_OBJECT_STORAGE_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || 'M5kmv62vtYMFrOwv2duhltYAAHLo26BbGeckKaG1lfE',
  AWS_S3_BUCKET: process.env.LINODE_OBJECT_BUCKET || process.env.AWS_S3_BUCKET || process.env.DO_SPACES_BUCKET || 'satyakabir-bucket',
  BUCKET_FOLDER_PATH: process.env.BUCKET_FOLDER_PATH || 'CCTV/',

  // Pino Logger
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // Razorpay (secret never exposed to clients)
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || 'rzp_live_TZUkX5PwlE7KzI',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || 'a8fY1FbquME6aKoybVs6YrhX',
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  CHECKOUT_SESSION_TTL_MINUTES: parseInt(process.env.CHECKOUT_SESSION_TTL_MINUTES || '30', 10),
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || (process.env.NODE_ENV === 'production' ? '1000' : '5000'), 10),
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),

  isDev: (process.env.NODE_ENV || 'development') === 'development',
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',

  // Application Public URL for full static / invoice links
  APP_URL: process.env.APP_URL || process.env.API_BASE_URL || process.env.BACKEND_URL || `http://localhost:${process.env.PORT || '5000'}`,

  // SMTP / Nodemailer Email Configuration
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '465', 10),
  SMTP_SECURE: process.env.SMTP_SECURE !== 'false',
  SMTP_USER: process.env.SMTP_USER || 'saburicctv998529@gmail.com',
  SMTP_PASS: process.env.SMTP_PASS || 'yqfwadiitilgifwb',
  EMAIL_FROM: process.env.EMAIL_FROM || '"SABURI SECURITY AGENCY PRIVATE LIMITED" <saburicctv998529@gmail.com>'
};

/**
 * Format full absolute URL for generated invoice PDFs
 */
export function getFullPdfUrl(fileNameOrPath) {
  if (!fileNameOrPath) return null;
  if (typeof fileNameOrPath !== 'string') return fileNameOrPath;
  if (fileNameOrPath.startsWith('http://') || fileNameOrPath.startsWith('https://')) {
    return fileNameOrPath;
  }
  const cleanPath = fileNameOrPath.startsWith('/') ? fileNameOrPath : `/uploads/invoices/${fileNameOrPath}`;
  const baseUrl = (env.APP_URL || `http://localhost:${env.PORT || 5000}`).replace(/\/$/, '');
  return `${baseUrl}${cleanPath}`;
}
