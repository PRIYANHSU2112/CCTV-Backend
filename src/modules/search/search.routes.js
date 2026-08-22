import { Router } from 'express';
import { validateRequest } from '../../shared/middlewares/validate.middleware.js';
import { globalSearchSchema } from './search.validator.js';

export const createSearchRouter = (searchController) => {
  const router = Router();

  router.get('/', validateRequest(globalSearchSchema, 'query'), searchController.globalSearch);

  return router;
};
