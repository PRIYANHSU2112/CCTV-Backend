import { AppError } from './app-error.js';
import { HttpStatus } from '../constants/http-status.constant.js';
import { Messages } from '../constants/messages.constant.js';

export class ValidationError extends AppError {
  constructor(message = Messages.BAD_REQUEST, errors = null) {
    super(message, HttpStatus.BAD_REQUEST, errors);
  }
}
