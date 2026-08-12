import { Router } from 'express';
import { validateRequest } from '../../shared/middlewares/validate.middleware.js';
import { authenticateJwt, requirePermission } from '../../shared/middlewares/auth.middleware.js';
import { Permissions } from '../../shared/constants/permissions.constant.js';
import {
  createUserSchema,
  mobileLoginSchema,
  sendOtpSchema,
  otpLoginSchema,
  adminLoginSchema,
  unifiedLoginSchema,
  updateUserSchema,
  updateStatusSchema,
  getUserByIdSchema,
  queryUserSchema
} from './user.validator.js';

export const createUserRouter = (userController) => {
  const router = Router();

  /**
   * @route POST /api/v1/users/register
   * @desc Register a new user (Client or Admin Staff)
   */
  router.post('/register', validateRequest(createUserSchema), userController.register);

  /**
   * @route POST /api/v1/users/otp/send
   * @desc Request Mobile OTP (Sends static OTP 1234 for testing)
   */
  router.post('/otp/send', validateRequest(sendOtpSchema), userController.sendOtp);

  /**
   * @route POST /api/v1/users/login/otp
   * @desc User Login / Register via Mobile Phone & OTP
   */
  router.post('/login/otp', validateRequest(otpLoginSchema), userController.loginOtp);

  /**
   * @route POST /api/v1/users/login/mobile
   * @desc User Login via Mobile Phone & Password
   */
  router.post('/login/mobile', validateRequest(mobileLoginSchema), userController.loginMobile);

  /**
   * @route POST /api/v1/users/login/admin
   * @desc Administration Staff Login via Username/Email & Password
   */
  router.post('/login/admin', validateRequest(adminLoginSchema), userController.loginAdmin);

  /**
   * @route POST /api/v1/users/login
   * @desc Unified Auto-detect Login (Mobile or Username/Email)
   */
  router.post('/login', validateRequest(unifiedLoginSchema), userController.loginUnified);

  /**
   * Protected User Management Routes
   */
  router.get('/', authenticateJwt, requirePermission(Permissions.USERS_VIEW), validateRequest(queryUserSchema, 'query'), userController.list);
  router.get('/:id', authenticateJwt, requirePermission(Permissions.USERS_VIEW), validateRequest(getUserByIdSchema, 'params'), userController.getById);
  router.put('/:id', authenticateJwt, requirePermission(Permissions.USERS_EDIT), validateRequest(getUserByIdSchema, 'params'), validateRequest(updateUserSchema), userController.update);
  router.patch('/:id/status', authenticateJwt, requirePermission(Permissions.USERS_STATUS), validateRequest(getUserByIdSchema, 'params'), validateRequest(updateStatusSchema), userController.updateStatus);
  router.delete('/:id', authenticateJwt, requirePermission(Permissions.USERS_DELETE), validateRequest(getUserByIdSchema, 'params'), userController.delete);

  return router;
};
