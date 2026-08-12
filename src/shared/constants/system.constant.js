import { UserRole } from './enum.constant.js';

export const SystemConstants = Object.freeze({
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 100
  },
  CACHE_TTL: {
    SHORT: 300,      // 5 mins
    MEDIUM: 1800,   // 30 mins
    LONG: 86400     // 24 hours
  },
  ROLES: UserRole
});
