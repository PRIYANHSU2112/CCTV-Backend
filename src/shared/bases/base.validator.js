import { BadRequestError } from '../errors/bad-request.error.js';

export class BaseValidator {
  /**
   * Validates target object against Joi schema
   */
  static validateSchema(schema, data, options = { stripUnknown: true, abortEarly: false }) {
    const { error, value } = schema.validate(data, options);

    if (error) {
      const details = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/"/g, '')
      }));

      throw new BadRequestError('Validation failed for request payload', details);
    }

    return value;
  }
}
