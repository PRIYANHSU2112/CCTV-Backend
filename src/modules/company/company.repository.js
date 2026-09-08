import { BaseRepository } from '../../shared/bases/base.repository.js';
import { CompanyModel } from './company.model.js';

export class CompanyRepository extends BaseRepository {
  constructor() {
    super();
    this.model = CompanyModel;
  }

  /**
   * Get single-tenant company profile or seed default company record
   */
  async getCompanyProfile() {
    let company = await this.model.findOne().exec();
    if (!company) {
      company = await this.model.create({
        legalName: 'Satya Kabir CCTV Private Limited',
        displayName: 'Satya Kabir CCTV Solutions',
        email: 'info@satyakabir.in',
        supportEmail: 'support@satyakabir.in',
        phone: '+919876543210',
        website: 'https://satyakabir.in',
        address: {
          street: 'Corporate Park, Sector 62',
          city: 'Noida',
          state: 'Uttar Pradesh',
          postalCode: '201301',
          country: 'India'
        },
        socialMedia: {
          facebook: 'https://facebook.com/satyakabir',
          instagram: 'https://instagram.com/satyakabir',
          twitter: 'https://twitter.com/satyakabir',
          linkedin: 'https://linkedin.com/company/satyakabir'
        },
        installationCharge: 6000,
        installationHsnSac: '995469',
        installationGstEnabled: true,
        installationGstRate: 18,
        financialDefaults: {
          currency: 'INR',
          timeZone: 'Asia/Kolkata',
          invoicePrefix: 'INV',
          installationCharge: 6000,
          installationHsnSac: '995469',
          installationGstEnabled: true,
          installationGstRate: 18
        },
        policies: {
          termsAndConditions: 'Default Terms and Conditions',
          privacyPolicy: 'Default Privacy Policy',
          refundPolicy: 'Default Refund Policy',
          cancellationPolicy: 'Default Cancellation Policy'
        }
      });
    }

    // Ensure fallback defaults if doc predates installation fields
    if (company) {
      if (company.installationCharge === undefined) company.installationCharge = 6000;
      if (!company.installationHsnSac) company.installationHsnSac = '995469';
      if (company.installationGstEnabled === undefined) company.installationGstEnabled = true;
      if (company.installationGstRate === undefined) company.installationGstRate = 18;
    }

    return company;
  }

  /**
   * Atomic update of company profile
   */
  async updateCompanyProfile(id, updateData) {
    return this.model.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).exec();
  }
}
