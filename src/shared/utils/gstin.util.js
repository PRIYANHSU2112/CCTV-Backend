/**
 * Indian GSTIN: 2 digit state + 5 letter PAN start + 4 digit + 1 letter + 1 alphanumeric + Z + 1 alphanumeric
 */
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/

export function isValidGstin(value) {
  if (value == null) return true
  const v = String(value).trim().toUpperCase()
  if (v === '') return true
  return GSTIN_REGEX.test(v)
}

export function normalizeGstin(value) {
  if (value == null) return undefined
  const v = String(value).trim().toUpperCase()
  return v === '' ? undefined : v
}

/** Map admin UI plan labels / slugs to BillingCycle enum */
export function normalizeBillingCycle(raw) {
  if (!raw) return 'MONTHLY'
  const key = String(raw)
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
  const map = {
    MONTHLY: 'MONTHLY',
    QUARTERLY: 'QUARTERLY',
    HALF_YEARLY: 'HALF_YEARLY',
    HALFYEARLY: 'HALF_YEARLY',
    YEARLY: 'YEARLY',
  }
  return map[key] || 'MONTHLY'
}

export function normalizePackageTier(raw) {
  if (!raw) return 'BASIC'
  return String(raw).trim().toUpperCase()
}

export const PACKAGE_CAMERA_COUNTS = {
  BASIC: 4,
  STANDARD: 8,
  PREMIUM: 16,
  ENTERPRISE: 32,
}

export const BILLING_CYCLE_MONTHS = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  YEARLY: 12,
}
