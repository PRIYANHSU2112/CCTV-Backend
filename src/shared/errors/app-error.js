import { HttpStatus } from '../constants/http-status.constant.js';
import { Messages } from '../constants/messages.constant.js';

export class AppError extends Error {
  constructor(message = Messages.INTERNAL_ERROR, statusCode = HttpStatus.INTERNAL_SERVER_ERROR, errors = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.errors = errors;

    Error.captureStackTrace(this, this.constructor);
  }
}
