import { BaseController } from '../../shared/bases/base.controller.js';
import { RbacService } from './rbac.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Messages } from '../../shared/constants/messages.constant.js';

export class RbacController extends BaseController {
  constructor() {
    super();
    this.listPermissions = this.listPermissions.bind(this);
    this.listRoles = this.listRoles.bind(this);
    this.createRole = this.createRole.bind(this);
    this.updateRole = this.updateRole.bind(this);
    this.deleteRole = this.deleteRole.bind(this);
    this.listAuditLogs = this.listAuditLogs.bind(this);
  }

  listPermissions = this.catchAsync(async (req, res) => {
    const registry = RbacService.getPermissionsRegistry();
    return this.sendResponse(res, registry, Messages.FETCHED);
  });

  listRoles = this.catchAsync(async (req, res) => {
    const matrix = await RbacService.listRoles();
    return this.sendResponse(res, matrix, Messages.FETCHED);
  });

  createRole = this.catchAsync(async (req, res) => {
    const role = await RbacService.createRole(req.body, req.user);
    return this.sendCreated(res, role, 'Role created successfully');
  });

  updateRole = this.catchAsync(async (req, res) => {
    const role = await RbacService.updateRole(req.params.id, req.body, req.user);
    return this.sendResponse(res, role, Messages.UPDATED);
  });

  deleteRole = this.catchAsync(async (req, res) => {
    const result = await RbacService.deleteRole(req.params.id, req.user);
    return this.sendResponse(res, result, Messages.DELETED);
  });

  listAuditLogs = this.catchAsync(async (req, res) => {
    const { items, page, limit, total } = await AuditService.listLogs(req.query);
    return this.sendPaginated(res, items, page, limit, total, Messages.FETCHED);
  });
}
