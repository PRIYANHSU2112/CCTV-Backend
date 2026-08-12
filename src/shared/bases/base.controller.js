import { ApiResponse } from '../responses/api-response.js';
import { HttpStatus } from '../constants/http-status.constant.js';
import { Messages } from '../constants/messages.constant.js';

export class BaseController {
  constructor() {
    this.sendResponse = ApiResponse.success.bind(ApiResponse);
    this.sendSuccess = ApiResponse.success.bind(ApiResponse);
    this.sendCreated = ApiResponse.created.bind(ApiResponse);
    this.sendPaginated = ApiResponse.paginated.bind(ApiResponse);
  }

  /**
   * Catch async execution wrapper helper for controller methods
   */
  catchAsync(fn) {
    return (req, res, next) => {
      fn(req, res, next).catch(next);
    };
  }
}
