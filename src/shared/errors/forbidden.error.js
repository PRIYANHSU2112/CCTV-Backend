import { AppError } from './app-error.js';
import { HttpStatus } from '../constants/http-status.constant.js';
import { Messages } from '../constants/messages.constant.js';

export class ForbiddenError extends AppError {
  constructor(message = Messages.FORBIDDEN) {
    super(message, HttpStatus.FORBIDDEN);
  }
}
