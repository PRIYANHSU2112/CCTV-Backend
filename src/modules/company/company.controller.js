import { BaseController } from '../../shared/bases/base.controller.js';
import { Messages } from '../../shared/constants/messages.constant.js';

export class CompanyController extends BaseController {
  constructor({ companyService }) {
    super();
    this.companyService = companyService;

    // Bind methods for Express routing
    this.getCompany = this.getCompany.bind(this);
    this.updateCompany = this.updateCompany.bind(this);
    this.getPublicCompanyProfile = this.getPublicCompanyProfile.bind(this);
  }

  getCompany = this.catchAsync(async (req, res) => {
    const company = await this.companyService.getCompany();
    return this.sendResponse(res, company, Messages.FETCHED);
  });

  getPublicCompanyProfile = this.catchAsync(async (req, res) => {
    const company = await this.companyService.getCompany();

    // Normalize address structure
    const normalizedAddress = typeof company.address === 'object' && company.address !== null
      ? {
          street: company.address.street || '',
          city: company.address.city || company.city || '',
          state: company.address.state || company.state || '',
          postalCode: company.address.postalCode || company.pincode || '',
          country: company.address.country || 'India',
          landmark: company.address.landmark || ''
        }
      : {
          street: company.address || '',
          city: company.city || '',
          state: company.state || '',
          postalCode: company.pincode || '',
          country: 'India',
          landmark: ''
        };

    const publicProfile = {
      legalName: company.legalName || 'SABURI SECURITY AGENCY',
      displayName: company.displayName || company.tradeName || 'SABURI SECURITY AGENCY',
      tradeName: company.tradeName || company.displayName || 'SABURI SECURITY AGENCY',
      tagline: company.tagline || company.branding?.tagline || 'Leading CCTV Surveillance & 24/7 Smart Security Solutions',
      phone: company.phone || '+91 98765 43210',
      alternatePhone: company.alternatePhone || '',
      email: company.email || 'info@saburisecurity.com',
      supportEmail: company.supportEmail || company.email || 'support@saburisecurity.com',
      website: company.website || 'https://saburisecurity.com',
      address: normalizedAddress,
      city: normalizedAddress.city,
      state: normalizedAddress.state,
      pincode: normalizedAddress.postalCode,
      gstin: company.gstin || company.taxId || '',
      pan: company.pan || '',
      businessType: company.businessType || 'PRIVATE_LIMITED',
      registrationNumber: company.registrationNumber || '',
      socialMedia: {
        facebook: company.socialMedia?.facebook || 'https://facebook.com',
        instagram: company.socialMedia?.instagram || 'https://instagram.com',
        twitter: company.socialMedia?.twitter || 'https://twitter.com',
        linkedin: company.socialMedia?.linkedin || 'https://linkedin.com',
        youtube: company.socialMedia?.youtube || 'https://youtube.com',
      },
      branding: {
        logoUrl: company.logoDataUrl || company.branding?.logoUrl || '',
        tagline: company.tagline || company.branding?.tagline || 'Leading CCTV Surveillance & 24/7 Smart Security Solutions',
        primaryColor: company.branding?.primaryColor || '#0f172a',
        secondaryColor: company.branding?.secondaryColor || '#3b82f6',
      },
      policies: {
        termsAndConditions: company.policies?.termsAndConditions || 'All surveillance equipment and services are governed by standard security agreement terms.',
        privacyPolicy: company.policies?.privacyPolicy || 'We respect your privacy and process video feeds strictly according to security standards.',
        refundPolicy: company.policies?.refundPolicy || 'Refunds on hardware and installation are subject to evaluation within 7 days.',
        cancellationPolicy: company.policies?.cancellationPolicy || 'Subscription plans may be cancelled with 30-day prior written notification.'
      },
      installationCharge: company.installationCharge !== undefined ? company.installationCharge : (company.financialDefaults?.installationCharge ?? 6000),
      installationHsnSac: company.installationHsnSac || company.financialDefaults?.installationHsnSac || '995469',
      installationGstEnabled: company.installationGstEnabled !== undefined ? company.installationGstEnabled : (company.financialDefaults?.installationGstEnabled ?? true),
      installationGstRate: company.installationGstRate !== undefined ? company.installationGstRate : (company.financialDefaults?.installationGstRate ?? 18),
      currency: company.financialDefaults?.currency || 'INR',
    };

    // Fast caching header for reverse proxies & browsers
    res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
    return this.sendResponse(res, publicProfile, Messages.FETCHED);
  });

  updateCompany = this.catchAsync(async (req, res) => {
    const company = await this.companyService.updateCompany(req.body);
    return this.sendResponse(res, company, Messages.UPDATED);
  });
}
