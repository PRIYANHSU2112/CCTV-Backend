import { Router } from 'express';
import { authenticateJwt, requirePermission } from '../../shared/middlewares/auth.middleware.js';
import { validateRequest } from '../../shared/middlewares/validate.middleware.js';
import { Permissions } from '../../shared/constants/permissions.constant.js';
import { updateCompanySchema } from './company.validator.js';

export const createCompanyRouter = (companyController) => {
  const router = Router();

  /**
   * @route GET /api/v1/company/public
   * @desc Public company details & installation settings for client portal checkout
   */
  router.get('/public', companyController.getPublicCompanyProfile);

  // Protect internal company management endpoints with JWT authentication
  router.use(authenticateJwt);

  /**
   * @route GET /api/v1/company
   * @desc Get company profile details
   */
  router.get('/', requirePermission(Permissions.COMPANY_VIEW), companyController.getCompany);

  /**
   * @route PUT /api/v1/company
   * @desc Update company profile details
   */
  router.put('/', requirePermission(Permissions.COMPANY_EDIT), validateRequest(updateCompanySchema), companyController.updateCompany);

  return router;
};
