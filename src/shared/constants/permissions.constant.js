/**
 * Centralized System Permissions Registry
 * 
 * Naming convention: <module>:<action>
 * Super Admin Wildcard: '*'
 */

export const Permissions = Object.freeze({
  // Wildcard Full Access
  ALL: '*',

  // User Management Permissions
  USERS_VIEW: 'users:view',
  USERS_CREATE: 'users:create',
  USERS_EDIT: 'users:edit',
  USERS_DELETE: 'users:delete',
  USERS_STATUS: 'users:status',

  // RBAC & Role Management Permissions
  ROLES_VIEW: 'roles:view',
  ROLES_CREATE: 'roles:create',
  ROLES_EDIT: 'roles:edit',
  ROLES_DELETE: 'roles:delete',
  PERMISSIONS_VIEW: 'permissions:view',

  // Client Management Permissions
  CLIENTS_VIEW: 'clients:view',
  CLIENTS_CREATE: 'clients:create',
  CLIENTS_EDIT: 'clients:edit',
  CLIENTS_DELETE: 'clients:delete',

  // Plans & Subscriptions Permissions
  PLANS_VIEW: 'plans:view',
  PLANS_CREATE: 'plans:create',
  PLANS_EDIT: 'plans:edit',
  PLANS_DELETE: 'plans:delete',
  SUBSCRIPTIONS_VIEW: 'subscriptions:view',
  SUBSCRIPTIONS_ASSIGN: 'subscriptions:assign',
  SUBSCRIPTIONS_RENEW: 'subscriptions:renew',
  SUBSCRIPTIONS_CANCEL: 'subscriptions:cancel',
  SUBSCRIPTIONS_STATUS: 'subscriptions:status',

  // Invoice Permissions
  INVOICES_VIEW: 'invoices:view',
  INVOICES_CREATE: 'invoices:create',
  INVOICES_EXPORT: 'invoices:export',
  INVOICES_EMAIL: 'invoices:email',

  // Payment Permissions
  PAYMENTS_VIEW: 'payments:view',
  PAYMENTS_RECORD: 'payments:record',

  // Reminder Permissions
  REMINDERS_VIEW: 'reminders:view',
  REMINDERS_CREATE: 'reminders:create',
  REMINDERS_EDIT: 'reminders:edit',
  REMINDERS_DELETE: 'reminders:delete',
  REMINDERS_SEND: 'reminders:send',

  // Report Permissions
  REPORTS_VIEW: 'reports:view',
  REPORTS_EXPORT: 'reports:export',

  // Company Profile Permissions
  COMPANY_VIEW: 'company:view',
  COMPANY_EDIT: 'company:edit',

  // Notification Permissions
  NOTIFICATIONS_VIEW: 'notifications:view',
  NOTIFICATIONS_SEND: 'notifications:send',
  NOTIFICATIONS_DELETE: 'notifications:delete',

  // Audit Log Permissions
  AUDIT_VIEW: 'audit_logs:view',

  // Dashboard Permissions
  DASHBOARD_VIEW: 'dashboard:view'
});

export const PermissionGroup = Object.freeze({
  USERS: [
    Permissions.USERS_VIEW,
    Permissions.USERS_CREATE,
    Permissions.USERS_EDIT,
    Permissions.USERS_DELETE,
    Permissions.USERS_STATUS,
  ],
  ROLES: [
    Permissions.ROLES_VIEW,
    Permissions.ROLES_CREATE,
    Permissions.ROLES_EDIT,
    Permissions.ROLES_DELETE,
    Permissions.PERMISSIONS_VIEW,
  ],
  CLIENTS: [
    Permissions.CLIENTS_VIEW,
    Permissions.CLIENTS_CREATE,
    Permissions.CLIENTS_EDIT,
    Permissions.CLIENTS_DELETE,
  ],
  PLANS: [
    Permissions.PLANS_VIEW,
    Permissions.PLANS_CREATE,
    Permissions.PLANS_EDIT,
    Permissions.PLANS_DELETE,
  ],
  SUBSCRIPTIONS: [
    Permissions.SUBSCRIPTIONS_VIEW,
    Permissions.SUBSCRIPTIONS_ASSIGN,
    Permissions.SUBSCRIPTIONS_RENEW,
    Permissions.SUBSCRIPTIONS_CANCEL,
    Permissions.SUBSCRIPTIONS_STATUS,
  ],
  INVOICES: [
    Permissions.INVOICES_VIEW,
    Permissions.INVOICES_CREATE,
    Permissions.INVOICES_EXPORT,
    Permissions.INVOICES_EMAIL,
  ],
  PAYMENTS: [
    Permissions.PAYMENTS_VIEW,
    Permissions.PAYMENTS_RECORD,
  ],
  REMINDERS: [
    Permissions.REMINDERS_VIEW,
    Permissions.REMINDERS_CREATE,
    Permissions.REMINDERS_EDIT,
    Permissions.REMINDERS_DELETE,
    Permissions.REMINDERS_SEND,
  ],
  REPORTS: [
    Permissions.REPORTS_VIEW,
    Permissions.REPORTS_EXPORT,
  ],
  COMPANY: [
    Permissions.COMPANY_VIEW,
    Permissions.COMPANY_EDIT,
  ],
  NOTIFICATIONS: [
    Permissions.NOTIFICATIONS_VIEW,
    Permissions.NOTIFICATIONS_SEND,
    Permissions.NOTIFICATIONS_DELETE,
  ],
  AUDIT: [
    Permissions.AUDIT_VIEW,
  ],
  DASHBOARD: [
    Permissions.DASHBOARD_VIEW,
  ],
});
