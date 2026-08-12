import { HttpStatus } from '../constants/http-status.constant.js';
import { Messages } from '../constants/messages.constant.js';

export class ApiResponse {
  /**
   * Standard Success Response
   */
  static success(res, data = null, message = Messages.SUCCESS, statusCode = HttpStatus.OK, meta = null) {
    return res.status(statusCode).json({
      success: true,
      statusCode,
      message,
      data,
      ...(meta && { meta })
    });
  }

  /**
   * Resource Created Response (201)
   */
  static created(res, data = null, message = Messages.CREATED) {
    return this.success(res, data, message, HttpStatus.CREATED);
  }

  /**
   * Paginated Response Format
   */
  static paginated(res, items, page, limit, total, message = Messages.FETCHED) {
    const totalPages = Math.ceil(total / limit);
    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      message,
      data: items,
      meta: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  }
}
