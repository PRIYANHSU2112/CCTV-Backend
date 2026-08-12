import { NotFoundError } from '../errors/not-found.error.js';
import { BadRequestError } from '../errors/bad-request.error.js';
import { SystemConstants } from '../constants/system.constant.js';

export class BaseService {
  /**
   * Helper to format pagination parameters
   */
  getPaginationParams(queryPage, queryLimit) {
    const page = Math.max(1, parseInt(queryPage || SystemConstants.PAGINATION.DEFAULT_PAGE, 10));
    const limit = Math.min(
      SystemConstants.PAGINATION.MAX_LIMIT,
      Math.max(1, parseInt(queryLimit || SystemConstants.PAGINATION.DEFAULT_LIMIT, 10))
    );
    const skip = (page - 1) * limit;

    return { page, limit, skip };
  }

  /**
   * Helper to throw NotFound error
   */
  throwNotFound(resourceName = 'Resource') {
    throw new NotFoundError(`${resourceName} not found`);
  }

  /**
   * Helper to throw BadRequest error
   */
  throwBadRequest(message = 'Invalid input') {
    throw new BadRequestError(message);
  }
}
