import mongoose from 'mongoose';
import { logger } from './logger.js';

/**
 * Run work inside a MongoDB multi-document ACID transaction.
 * Requires a replica set (MongoDB Atlas qualifies).
 */
export async function withMongoTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (err) {
    const msg = String(err?.message || err);
    if (/Transaction numbers are only allowed|replica set|not supported/i.test(msg)) {
      logger.error(
        'MongoDB transactions require a replica set. Falling back to non-transactional writes is disabled for checkout ACID safety.',
      );
    }
    throw err;
  } finally {
    await session.endSession();
  }
}
