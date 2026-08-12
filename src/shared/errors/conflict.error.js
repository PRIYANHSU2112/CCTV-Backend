import { AppError } from './app-error.js';
import { HttpStatus } from '../constants/http-status.constant.js';
import { Messages } from '../constants/messages.constant.js';

export class ConflictError extends AppError {
  constructor(message = Messages.CONFLICT) {
    super(message, HttpStatus.CONFLICT);
  }
}
