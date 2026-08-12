import { Router } from 'express';
import { authenticateJwt, requirePermission } from '../../shared/middlewares/auth.middleware.js';
import { validateRequest } from '../../shared/middlewares/validate.middleware.js';
import { Permissions } from '../../shared/constants/permissions.constant.js';
import {
  createRoleSchema,
  updateRoleSchema,
  getRoleByIdSchema,
  queryAuditLogSchema
} from './rbac.validator.js';

export const createRbacRouter = (rbacController) => {
  const router = Router();

  // All RBAC endpoints require valid JWT authentication
  router.use(authenticateJwt);

  /**
   * @route GET /api/v1/rbac/permissions
   * @desc Get system permissions registry
   */
  router.get('/permissions', requirePermission(Permissions.PERMISSIONS_VIEW), rbacController.listPermissions);

  /**
   * @route GET /api/v1/rbac/roles
   * @desc Get list of roles and permission matrix
   */
  router.get('/roles', requirePermission(Permissions.ROLES_VIEW), rbacController.listRoles);

  /**
   * @route POST /api/v1/rbac/roles
   * @desc Create custom role
   */
  router.post('/roles', requirePermission(Permissions.ROLES_CREATE), validateRequest(createRoleSchema), rbacController.createRole);

  /**
   * @route PUT /api/v1/rbac/roles/:id
   * @desc Update custom role permissions
   */
  router.put('/roles/:id', requirePermission(Permissions.ROLES_EDIT), validateRequest(getRoleByIdSchema, 'params'), validateRequest(updateRoleSchema), rbacController.updateRole);

  /**
   * @route DELETE /api/v1/rbac/roles/:id
   * @desc Delete custom role
   */
  router.delete('/roles/:id', requirePermission(Permissions.ROLES_DELETE), validateRequest(getRoleByIdSchema, 'params'), rbacController.deleteRole);

  /**
   * @route GET /api/v1/rbac/audit-logs
   * @desc Retrieve audit logs
   */
  router.get('/audit-logs', requirePermission(Permissions.AUDIT_VIEW), validateRequest(queryAuditLogSchema, 'query'), rbacController.listAuditLogs);

  return router;
};
