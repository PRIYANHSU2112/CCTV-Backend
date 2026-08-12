import { jest } from '@jest/globals';
import { requirePermission, requireRole } from '../../shared/middlewares/auth.middleware.js';
import { Permissions } from '../../shared/constants/permissions.constant.js';
import { UserRole } from '../../shared/constants/enum.constant.js';

describe('Auth Middleware Authorization Checks (Unit Tests)', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = { user: null };
    res = {};
    next = jest.fn();
  });

  describe('requirePermission', () => {
    it('should return 401 Unauthorized if user is not authenticated', () => {
      const middleware = requirePermission(Permissions.USERS_VIEW);
      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(401);
      expect(error.message).toContain('Authentication required');
    });

    it('should return 403 Forbidden if user lacks required permission', () => {
      req.user = { id: 'usr_1', role: UserRole.CLIENT, permissions: [Permissions.INVOICES_VIEW] };
      const middleware = requirePermission(Permissions.USERS_CREATE);
      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(403);
      expect(error.message).toContain('Access denied: missing required permission [users:create]');
    });

    it('should call next() if user possesses required permission', () => {
      req.user = { id: 'usr_2', role: UserRole.OPERATIONS_TEAM, permissions: [Permissions.USERS_CREATE] };
      const middleware = requirePermission(Permissions.USERS_CREATE);
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should call next() if user is Super Admin with wildcard "*"', () => {
      req.user = { id: 'admin_1', role: UserRole.SUPER_ADMIN, permissions: ['*'] };
      const middleware = requirePermission(Permissions.ROLES_DELETE);
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('requireRole', () => {
    it('should return 403 Forbidden if user role is not authorized', () => {
      req.user = { id: 'usr_1', role: UserRole.CLIENT };
      const middleware = requireRole(UserRole.SUPER_ADMIN, UserRole.ACCOUNTS_MANAGER);
      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(403);
    });

    it('should call next() if user role is allowed', () => {
      req.user = { id: 'usr_2', role: UserRole.SUPER_ADMIN };
      const middleware = requireRole(UserRole.SUPER_ADMIN);
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });
  });
});
