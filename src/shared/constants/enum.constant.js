/**
 * Centralized Application Enums & Data Model Constants
 */

export const UserRole = Object.freeze({
  SUPER_ADMIN: 'SUPER_ADMIN',
  ACCOUNTS_MANAGER: 'ACCOUNTS_MANAGER',
  OPERATIONS_TEAM: 'OPERATIONS_TEAM',
  CLIENT: 'CLIENT'
});

export const UserStatus = Object.freeze({
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED'
});

export const PackageTier = Object.freeze({
  BASIC: 'BASIC',
  STANDARD: 'STANDARD',
  PREMIUM: 'PREMIUM',
  ENTERPRISE: 'ENTERPRISE'
});

export const BillingCycle = Object.freeze({
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  HALF_YEARLY: 'HALF_YEARLY',
  YEARLY: 'YEARLY'
});

export const PlanStatus = Object.freeze({
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  ARCHIVED: 'ARCHIVED'
});

export const SubscriptionStatus = Object.freeze({
  ACTIVE: 'ACTIVE',
  DUE: 'DUE',
  EXPIRED: 'EXPIRED',
  SUSPENDED: 'SUSPENDED',
  CANCELLED: 'CANCELLED',
  PENDING_PAYMENT: 'PENDING_PAYMENT',
});

export const CheckoutSessionStatus = Object.freeze({
  PENDING: 'PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
});

export const FileCategory = Object.freeze({
  AVATAR: 'AVATAR',
  DOCUMENT: 'DOCUMENT',
  IMAGE: 'IMAGE',
  MEDIA: 'MEDIA'
});

export const HealthStatus = Object.freeze({
  UP: 'UP',
  DOWN: 'DOWN'
});

export const ClientStatus = Object.freeze({
  ACTIVE: 'Active',
  DUE: 'Due',
  OVERDUE: 'Overdue',
  SUSPENDED: 'Suspended'
});

export const CameraStatus = Object.freeze({
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
  MAINTENANCE: 'MAINTENANCE'
});

export const PaymentMethod = Object.freeze({
  UPI: 'UPI',
  BANK_TRANSFER: 'BANK_TRANSFER',
  CASH: 'CASH',
  GATEWAY: 'GATEWAY'
});

export const PaymentStatus = Object.freeze({
  PAID: 'PAID',
  PARTIAL: 'PARTIAL',
  PENDING: 'PENDING',
  FAILED: 'FAILED'
});
