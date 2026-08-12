import Joi from 'joi';

export const updateCompanySchema = Joi.object({
  legalName: Joi.string().min(2).max(150).optional(),
  displayName: Joi.string().min(2).max(150).optional(),
  registrationNumber: Joi.string().allow('', null).optional(),
  taxId: Joi.string().allow('', null).optional(),
  businessType: Joi.string().valid('PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'OTHER').optional(),
  email: Joi.string().email().optional(),
  supportEmail: Joi.string().email().allow('', null).optional(),
  phone: Joi.string().optional(),
  alternatePhone: Joi.string().allow('', null).optional(),
  website: Joi.string().uri({ allowRelative: false }).allow('', null).optional(),
  
  address: Joi.object({
    street: Joi.string().allow('', null).optional(),
    city: Joi.string().allow('', null).optional(),
    state: Joi.string().allow('', null).optional(),
    postalCode: Joi.string().allow('', null).optional(),
    country: Joi.string().allow('', null).optional(),
    landmark: Joi.string().allow('', null).optional()
  }).optional(),

  branding: Joi.object({
    logoUrl: Joi.string().allow('', null).optional(),
    faviconUrl: Joi.string().allow('', null).optional(),
    primaryColor: Joi.string().allow('', null).optional(),
    secondaryColor: Joi.string().allow('', null).optional(),
    tagline: Joi.string().allow('', null).optional()
  }).optional(),

  socialMedia: Joi.object({
    facebook: Joi.string().allow('', null).optional(),
    instagram: Joi.string().allow('', null).optional(),
    twitter: Joi.string().allow('', null).optional(),
    linkedin: Joi.string().allow('', null).optional(),
    youtube: Joi.string().allow('', null).optional()
  }).optional(),

  policies: Joi.object({
    termsAndConditions: Joi.string().allow('', null).optional(),
    privacyPolicy: Joi.string().allow('', null).optional(),
    refundPolicy: Joi.string().allow('', null).optional(),
    cancellationPolicy: Joi.string().allow('', null).optional()
  }).optional(),

  financialDefaults: Joi.object({
    currency: Joi.string().allow('', null).optional(),
    timeZone: Joi.string().allow('', null).optional(),
    invoicePrefix: Joi.string().allow('', null).optional()
  }).optional()
});
