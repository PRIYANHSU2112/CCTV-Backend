import { AppError } from './app-error.js';
import { HttpStatus } from '../constants/http-status.constant.js';
import { Messages } from '../constants/messages.constant.js';

export class InternalServerError extends AppError {
  constructor(message = Messages.INTERNAL_ERROR) {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
