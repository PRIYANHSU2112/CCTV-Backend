import { BaseValidator } from '../bases/base.validator.js';

export const validateRequest = (schema, source = 'body') => {
  return (req, res, next) => {
    try {
      const validatedData = BaseValidator.validateSchema(schema, req[source]);
      req[source] = validatedData;
      next();
    } catch (err) {
      next(err);
    }
  };
};
