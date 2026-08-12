import { UserRole } from '../constants/enum.constant.js';
import { Permissions } from '../constants/permissions.constant.js';

export const ROLE_HIERARCHY = Object.freeze({
  [UserRole.SUPER_ADMIN]: 100,
  [UserRole.ACCOUNTS_MANAGER]: 50,
  [UserRole.OPERATIONS_TEAM]: 30,
  [UserRole.CLIENT]: 10,
});

export class RbacPolicy {
  /**
   * Get numerical hierarchy for a given role name
   */
  static getRoleHierarchy(roleName) {
    if (!roleName) return 0;
    if (ROLE_HIERARCHY[roleName] !== undefined) {
      return ROLE_HIERARCHY[roleName];
    }
    // Default custom sub-admin roles get hierarchy level 20 unless specified
    return 20;
  }

  /**
   * Check if a list of user permissions satisfies a single required permission
   */
  static hasPermission(userPermissions = [], requiredPermission) {
    if (!requiredPermission) return true;
    if (!Array.isArray(userPermissions)) return false;

    // Super Admin wildcard check
    if (userPermissions.includes(Permissions.ALL)) {
      return true;
    }

    // Exact permission match
    if (userPermissions.includes(requiredPermission)) {
      return true;
    }

    // Module wildcard check (e.g. 'users:*' matches 'users:create')
    const [moduleName] = requiredPermission.split(':');
    if (moduleName && userPermissions.includes(`${moduleName}:*`)) {
      return true;
    }

    return false;
  }

  /**
   * Check if user permissions satisfy ALL specified required permissions
   */
  static hasAllPermissions(userPermissions = [], requiredPermissions = []) {
    if (!Array.isArray(requiredPermissions) || requiredPermissions.length === 0) {
      return true;
    }
    return requiredPermissions.every((perm) => this.hasPermission(userPermissions, perm));
  }

  /**
   * Check if user permissions satisfy AT LEAST ONE specified required permission
   */
  static hasAnyPermission(userPermissions = [], requiredPermissions = []) {
    if (!Array.isArray(requiredPermissions) || requiredPermissions.length === 0) {
      return true;
    }
    return requiredPermissions.some((perm) => this.hasPermission(userPermissions, perm));
  }

  /**
   * Privilege Escalation Check: Verify if an actor can create/assign a role of targetHierarchy
   */
  static canAssignRole(actorRole, targetRole) {
    if (actorRole === UserRole.SUPER_ADMIN) {
      return true;
    }
    const actorLevel = this.getRoleHierarchy(actorRole);
    const targetLevel = this.getRoleHierarchy(targetRole);

    // Actor can only assign roles strictly lower in hierarchy
    return actorLevel > targetLevel;
  }

  /**
   * Privilege Escalation Check: Verify if an actor can grant a set of permissions
   */
  static canGrantPermissions(actorPermissions = [], targetPermissions = []) {
    if (actorPermissions.includes(Permissions.ALL)) {
      return true;
    }
    // Actor cannot grant any permission they do not personally possess
    return targetPermissions.every((perm) => this.hasPermission(actorPermissions, perm));
  }
}
