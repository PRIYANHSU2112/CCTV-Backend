import { AppError } from './app-error.js';
import { HttpStatus } from '../constants/http-status.constant.js';
import { Messages } from '../constants/messages.constant.js';

export class NotFoundError extends AppError {
  constructor(message = Messages.NOT_FOUND) {
    super(message, HttpStatus.NOT_FOUND);
  }
}
