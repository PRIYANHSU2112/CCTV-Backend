import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema(
  {
    street: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    postalCode: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: 'India' },
    landmark: { type: String, trim: true, default: '' }
  },
  { _id: false }
);

const brandingSchema = new mongoose.Schema(
  {
    logoUrl: { type: String, trim: true, default: '' },
    faviconUrl: { type: String, trim: true, default: '' },
    primaryColor: { type: String, trim: true, default: '#0f172a' },
    secondaryColor: { type: String, trim: true, default: '#3b82f6' },
    tagline: { type: String, trim: true, default: '' }
  },
  { _id: false }
);

const socialMediaSchema = new mongoose.Schema(
  {
    facebook: { type: String, trim: true, default: '' },
    instagram: { type: String, trim: true, default: '' },
    twitter: { type: String, trim: true, default: '' },
    linkedin: { type: String, trim: true, default: '' },
    youtube: { type: String, trim: true, default: '' }
  },
  { _id: false }
);

const policiesSchema = new mongoose.Schema(
  {
    termsAndConditions: { type: String, default: '' },
    privacyPolicy: { type: String, default: '' },
    refundPolicy: { type: String, default: '' },
    cancellationPolicy: { type: String, default: '' }
  },
  { _id: false }
);

const financialDefaultsSchema = new mongoose.Schema(
  {
    currency: { type: String, trim: true, default: 'INR' },
    timeZone: { type: String, trim: true, default: 'Asia/Kolkata' },
    invoicePrefix: { type: String, trim: true, default: 'INV' }
  },
  { _id: false }
);

const companySchema = new mongoose.Schema(
  {
    legalName: {
      type: String,
      required: [true, 'Legal company name is required'],
      trim: true,
      minlength: [2, 'Legal name must be at least 2 characters'],
      maxlength: [150, 'Legal name cannot exceed 150 characters']
    },
    displayName: {
      type: String,
      required: [true, 'Display company name is required'],
      trim: true,
      minlength: [2, 'Display name must be at least 2 characters'],
      maxlength: [150, 'Display name cannot exceed 150 characters']
    },
    registrationNumber: {
      type: String,
      trim: true,
      default: ''
    },
    taxId: {
      type: String,
      trim: true,
      default: ''
    },
    businessType: {
      type: String,
      enum: ['PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'OTHER'],
      default: 'PRIVATE_LIMITED'
    },
    email: {
      type: String,
      required: [true, 'Official company email is required'],
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
    },
    supportEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: ''
    },
    phone: {
      type: String,
      required: [true, 'Company phone number is required'],
      trim: true
    },
    alternatePhone: {
      type: String,
      trim: true,
      default: ''
    },
    website: {
      type: String,
      trim: true,
      default: ''
    },
    address: {
      type: addressSchema,
      default: () => ({})
    },
    branding: {
      type: brandingSchema,
      default: () => ({})
    },
    socialMedia: {
      type: socialMediaSchema,
      default: () => ({})
    },
    policies: {
      type: policiesSchema,
      default: () => ({})
    },
    financialDefaults: {
      type: financialDefaultsSchema,
      default: () => ({})
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

export const CompanyModel = mongoose.models.Company || mongoose.model('Company', companySchema);
