import { AppError } from './app-error.js';
import { HttpStatus } from '../constants/http-status.constant.js';
import { Messages } from '../constants/messages.constant.js';

export class UnauthorizedError extends AppError {
  constructor(message = Messages.UNAUTHORIZED) {
    super(message, HttpStatus.UNAUTHORIZED);
  }
}
