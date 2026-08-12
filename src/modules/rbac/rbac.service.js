import { RoleModel } from './role.model.js';
import { Permissions, PermissionGroup } from '../../shared/constants/permissions.constant.js';
import { UserRole } from '../../shared/constants/enum.constant.js';
import { RbacPolicy } from '../../shared/security/rbac.policy.js';
import { AuditService } from '../audit/audit.service.js';
import { ConflictError } from '../../shared/errors/conflict.error.js';
import { ForbiddenError } from '../../shared/errors/forbidden.error.js';
import { NotFoundError } from '../../shared/errors/not-found.error.js';
import { BadRequestError } from '../../shared/errors/bad-request.error.js';

export class RbacService {
  /**
   * Seed Default System Roles into MongoDB
   */
  static async seedDefaultRoles() {
    const defaultRoles = [
      {
        name: UserRole.SUPER_ADMIN,
        description: 'Super Administrator with full system access',
        permissions: [Permissions.ALL],
        isSystemRole: true,
        hierarchy: 100
      },
      {
        name: UserRole.ACCOUNTS_MANAGER,
        description: 'Finance & Accounts Manager scoped to financial operations',
        permissions: [
          ...PermissionGroup.CLIENTS,
          ...PermissionGroup.SUBSCRIPTIONS,
          ...PermissionGroup.INVOICES,
          ...PermissionGroup.PAYMENTS,
          ...PermissionGroup.REPORTS,
          Permissions.COMPANY_VIEW,
        ],
        isSystemRole: true,
        hierarchy: 50
      },
      {
        name: UserRole.OPERATIONS_TEAM,
        description: 'Operations Staff managing clients, plans, and reminders',
        permissions: [
          Permissions.CLIENTS_VIEW,
          Permissions.CLIENTS_CREATE,
          Permissions.CLIENTS_EDIT,
          Permissions.PLANS_VIEW,
          Permissions.SUBSCRIPTIONS_VIEW,
          ...PermissionGroup.REMINDERS,
          Permissions.REPORTS_VIEW,
        ],
        isSystemRole: true,
        hierarchy: 30
      },
      {
        name: UserRole.CLIENT,
        description: 'Client portal account',
        permissions: [
          Permissions.SUBSCRIPTIONS_VIEW,
          Permissions.INVOICES_VIEW,
          Permissions.PAYMENTS_VIEW,
        ],
        isSystemRole: true,
        hierarchy: 10
      }
    ];

    for (const roleData of defaultRoles) {
      await RoleModel.updateOne(
        { name: roleData.name },
        { $setOnInsert: roleData },
        { upsert: true }
      );
    }
  }

  /**
   * Get permissions for a specific role
   */
  static async getRolePermissions(roleName) {
    if (!roleName) return [];
    if (roleName === UserRole.SUPER_ADMIN) {
      return [Permissions.ALL];
    }

    const roleDoc = await RoleModel.findOne({ name: roleName }).lean();
    if (roleDoc && Array.isArray(roleDoc.permissions)) {
      return roleDoc.permissions;
    }

    // Fallback to static policy hierarchy defaults if role model not yet seeded
    switch (roleName) {
      case UserRole.ACCOUNTS_MANAGER:
        return [
          ...PermissionGroup.CLIENTS,
          ...PermissionGroup.SUBSCRIPTIONS,
          ...PermissionGroup.INVOICES,
          ...PermissionGroup.PAYMENTS,
          ...PermissionGroup.REPORTS,
          Permissions.COMPANY_VIEW,
        ];
      case UserRole.OPERATIONS_TEAM:
        return [
          Permissions.CLIENTS_VIEW,
          Permissions.CLIENTS_CREATE,
          Permissions.CLIENTS_EDIT,
          Permissions.PLANS_VIEW,
          Permissions.SUBSCRIPTIONS_VIEW,
          ...PermissionGroup.REMINDERS,
          Permissions.REPORTS_VIEW,
        ];
      case UserRole.CLIENT:
        return [
          Permissions.SUBSCRIPTIONS_VIEW,
          Permissions.INVOICES_VIEW,
          Permissions.PAYMENTS_VIEW,
        ];
      default:
        return [];
    }
  }

  /**
   * List all system permissions and grouping metadata
   */
  static getPermissionsRegistry() {
    return {
      permissions: Object.values(Permissions),
      groups: PermissionGroup
    };
  }

  /**
   * List all roles with permission matrix
   */
  static async listRoles() {
    await this.seedDefaultRoles();
    const roles = await RoleModel.find().sort({ hierarchy: -1 }).lean();
    const allPermissions = Object.values(Permissions).filter((p) => p !== '*');

    const formattedRoles = roles.map((role) => ({
      ...role,
      id: role._id.toString()
    }));

    const matrix = allPermissions.map((permission) => ({
      permission,
      access: Object.fromEntries(
        formattedRoles.map((role) => [
          role.name,
          RbacPolicy.hasPermission(role.permissions, permission)
        ])
      )
    }));

    return {
      roles: formattedRoles,
      permissions: allPermissions,
      matrix
    };
  }

  /**
   * Create a new custom role (with privilege escalation check)
   */
  static async createRole(roleData, actorUser) {
    const { name, description, permissions = [], hierarchy = 20 } = roleData;
    const cleanName = name.trim().toUpperCase();

    const existing = await RoleModel.findOne({ name: cleanName });
    if (existing) {
      throw new ConflictError(`Role '${cleanName}' already exists`);
    }

    // Privilege Escalation Check: Hierarchy
    if (!RbacPolicy.canAssignRole(actorUser.role, cleanName)) {
      await AuditService.logEvent({
        actor: actorUser,
        action: 'PRIVILEGE_ESCALATION_ATTEMPT',
        targetType: 'Role',
        changes: { attemptedRole: cleanName, reason: 'Target hierarchy exceeds actor' }
      });
      throw new ForbiddenError('Privilege escalation denied: Cannot create a role with higher hierarchy than your own');
    }

    // Privilege Escalation Check: Permissions
    const actorPermissions = await this.getRolePermissions(actorUser.role);
    if (!RbacPolicy.canGrantPermissions(actorPermissions, permissions)) {
      await AuditService.logEvent({
        actor: actorUser,
        action: 'PRIVILEGE_ESCALATION_ATTEMPT',
        targetType: 'Role',
        changes: { attemptedPermissions: permissions, reason: 'Granting unpossessed permissions' }
      });
      throw new ForbiddenError('Privilege escalation denied: Cannot grant permissions that you do not possess');
    }

    const newRole = await RoleModel.create({
      name: cleanName,
      description,
      permissions,
      isSystemRole: false,
      hierarchy: Math.min(hierarchy, RbacPolicy.getRoleHierarchy(actorUser.role) - 1)
    });

    const roleObj = newRole.toJSON ? newRole.toJSON() : newRole;

    await AuditService.logEvent({
      actor: actorUser,
      action: 'ROLE_CREATED',
      targetType: 'Role',
      targetId: roleObj.id,
      changes: { name: cleanName, permissions }
    });

    return roleObj;
  }

  /**
   * Update role permissions (with privilege escalation check)
   */
  static async updateRole(id, updateData, actorUser) {
    const roleDoc = await RoleModel.findById(id);
    if (!roleDoc) {
      throw new NotFoundError('Role not found');
    }

    if (roleDoc.isSystemRole && roleDoc.name === UserRole.SUPER_ADMIN) {
      throw new BadRequestError('Super Admin system role permissions cannot be modified');
    }

    // Check hierarchy privilege escalation
    if (!RbacPolicy.canAssignRole(actorUser.role, roleDoc.name)) {
      throw new ForbiddenError('Privilege escalation denied: Cannot modify a role equal or higher in hierarchy');
    }

    // Check granted permissions privilege escalation
    if (updateData.permissions) {
      const actorPermissions = await this.getRolePermissions(actorUser.role);
      if (!RbacPolicy.canGrantPermissions(actorPermissions, updateData.permissions)) {
        throw new ForbiddenError('Privilege escalation denied: Cannot grant permissions you do not possess');
      }
    }

    const previousPermissions = [...roleDoc.permissions];
    if (updateData.description !== undefined) roleDoc.description = updateData.description;
    if (updateData.permissions !== undefined) roleDoc.permissions = updateData.permissions;

    await roleDoc.save();
    const roleObj = roleDoc.toJSON ? roleDoc.toJSON() : roleDoc;

    await AuditService.logEvent({
      actor: actorUser,
      action: 'ROLE_UPDATED',
      targetType: 'Role',
      targetId: roleObj.id,
      changes: { before: previousPermissions, after: roleObj.permissions }
    });

    return roleObj;
  }

  /**
   * Delete custom role
   */
  static async deleteRole(id, actorUser) {
    const roleDoc = await RoleModel.findById(id);
    if (!roleDoc) {
      throw new NotFoundError('Role not found');
    }

    if (roleDoc.isSystemRole) {
      throw new BadRequestError(`System role '${roleDoc.name}' cannot be deleted`);
    }

    if (!RbacPolicy.canAssignRole(actorUser.role, roleDoc.name)) {
      throw new ForbiddenError('Privilege escalation denied: Cannot delete a role equal or higher in hierarchy');
    }

    await RoleModel.findByIdAndDelete(id);

    await AuditService.logEvent({
      actor: actorUser,
      action: 'ROLE_DELETED',
      targetType: 'Role',
      targetId: id,
      changes: { deletedRole: roleDoc.name }
    });

    return { id, deleted: true };
  }
}
