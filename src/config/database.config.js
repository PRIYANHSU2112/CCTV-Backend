import mongoose from 'mongoose';
import { env } from './env.config.js';
import { logger } from '../shared/utils/logger.js';

let isConnected = false;

export const connectDatabase = async () => {
  if (isConnected) {
    return mongoose.connection;
  }

  const options = {
    autoIndex: env.isDev,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000
  };

  mongoose.connection.on('connected', () => {
    isConnected = true;
    logger.info('MongoDB database connection established successfully.');
  });

  mongoose.connection.on('error', (err) => {
    logger.error(`MongoDB connection error: ${err.message}`);
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    logger.warn('MongoDB connection lost. Reconnecting...');
  });

  try {
    await mongoose.connect(env.MONGODB_URI, options);
    return mongoose.connection;
  } catch (err) {
    logger.error(`Failed to connect to MongoDB at ${env.MONGODB_URI}: ${err.message}`);
    // If in test or dev mode, continue gracefully without crashing hard
    if (env.isProd) {
      process.exit(1);
    }
  }
};

export const disconnectDatabase = async () => {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('MongoDB database connection closed cleanly.');
  }
};
