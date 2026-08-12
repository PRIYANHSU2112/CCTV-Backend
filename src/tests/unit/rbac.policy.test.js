import { RbacPolicy } from '../../shared/security/rbac.policy.js';
import { Permissions } from '../../shared/constants/permissions.constant.js';
import { UserRole } from '../../shared/constants/enum.constant.js';

describe('RbacPolicy (Unit Tests)', () => {
  describe('hasPermission', () => {
    it('should grant access to Super Admin with wildcard "*"', () => {
      const userPermissions = ['*'];
      expect(RbacPolicy.hasPermission(userPermissions, Permissions.USERS_CREATE)).toBe(true);
      expect(RbacPolicy.hasPermission(userPermissions, Permissions.INVOICES_EXPORT)).toBe(true);
    });

    it('should grant access when exact permission is present', () => {
      const userPermissions = [Permissions.USERS_VIEW, Permissions.USERS_CREATE];
      expect(RbacPolicy.hasPermission(userPermissions, Permissions.USERS_CREATE)).toBe(true);
      expect(RbacPolicy.hasPermission(userPermissions, Permissions.USERS_DELETE)).toBe(false);
    });

    it('should grant access when module wildcard is present', () => {
      const userPermissions = ['users:*', 'invoices:view'];
      expect(RbacPolicy.hasPermission(userPermissions, Permissions.USERS_CREATE)).toBe(true);
      expect(RbacPolicy.hasPermission(userPermissions, Permissions.USERS_DELETE)).toBe(true);
      expect(RbacPolicy.hasPermission(userPermissions, Permissions.INVOICES_CREATE)).toBe(false);
    });

    it('should deny access when permission is missing', () => {
      const userPermissions = [Permissions.CLIENTS_VIEW];
      expect(RbacPolicy.hasPermission(userPermissions, Permissions.PAYMENTS_RECORD)).toBe(false);
    });
  });

  describe('canAssignRole (Hierarchy Check)', () => {
    it('should allow Super Admin to assign any role', () => {
      expect(RbacPolicy.canAssignRole(UserRole.SUPER_ADMIN, UserRole.ACCOUNTS_MANAGER)).toBe(true);
      expect(RbacPolicy.canAssignRole(UserRole.SUPER_ADMIN, UserRole.SUPER_ADMIN)).toBe(true);
    });

    it('should allow higher role to assign lower role', () => {
      expect(RbacPolicy.canAssignRole(UserRole.ACCOUNTS_MANAGER, UserRole.OPERATIONS_TEAM)).toBe(true);
      expect(RbacPolicy.canAssignRole(UserRole.OPERATIONS_TEAM, UserRole.CLIENT)).toBe(true);
    });

    it('should deny privilege escalation attempting to assign equal or higher role', () => {
      expect(RbacPolicy.canAssignRole(UserRole.OPERATIONS_TEAM, UserRole.ACCOUNTS_MANAGER)).toBe(false);
      expect(RbacPolicy.canAssignRole(UserRole.ACCOUNTS_MANAGER, UserRole.SUPER_ADMIN)).toBe(false);
    });
  });

  describe('canGrantPermissions (Privilege Escalation Check)', () => {
    it('should allow Super Admin to grant any permission', () => {
      const actorPermissions = ['*'];
      const targetPermissions = [Permissions.USERS_CREATE, Permissions.ROLES_CREATE];
      expect(RbacPolicy.canGrantPermissions(actorPermissions, targetPermissions)).toBe(true);
    });

    it('should allow actor to grant permissions they possess', () => {
      const actorPermissions = [Permissions.USERS_VIEW, Permissions.USERS_CREATE];
      const targetPermissions = [Permissions.USERS_VIEW];
      expect(RbacPolicy.canGrantPermissions(actorPermissions, targetPermissions)).toBe(true);
    });

    it('should prevent privilege escalation when actor grants unpossessed permissions', () => {
      const actorPermissions = [Permissions.USERS_VIEW];
      const targetPermissions = [Permissions.USERS_VIEW, Permissions.USERS_DELETE];
      expect(RbacPolicy.canGrantPermissions(actorPermissions, targetPermissions)).toBe(false);
    });
  });
});
