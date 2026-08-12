import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../errors/unauthorized.error.js';
import { ForbiddenError } from '../errors/forbidden.error.js';
import { env } from '../../config/env.config.js';
import { RbacService } from '../../modules/rbac/rbac.service.js';
import { RbacPolicy } from '../security/rbac.policy.js';

export const authenticateJwt = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Authentication token required'));
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    const userPermissions = await RbacService.getRolePermissions(decoded.role);

    req.user = {
      ...decoded,
      permissions: userPermissions
    };
    next();
  } catch (err) {
    next(new UnauthorizedError('Invalid or expired authentication token'));
  }
};

export const requirePermission = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    const hasAccess = RbacPolicy.hasAllPermissions(req.user.permissions, requiredPermissions);
    if (!hasAccess) {
      return next(new ForbiddenError(`Access denied: missing required permission [${requiredPermissions.join(', ')}]`));
    }

    next();
  };
};

export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError('Access denied: role not authorized'));
    }

    next();
  };
};
