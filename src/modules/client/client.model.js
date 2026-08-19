import mongoose from 'mongoose';
import { ClientStatus, CameraStatus } from '../../shared/constants/enum.constant.js';

const cameraDetailSchema = new mongoose.Schema(
  {
    location: {
      type: String,
      required: [true, 'Camera location is required'],
      trim: true
    },
    ipAddress: {
      type: String,
      trim: true
    },
    serialNumber: {
      type: String,
      trim: true
    },
    status: {
      type: String,
      enum: Object.values(CameraStatus),
      default: CameraStatus.ONLINE
    }
  },
  { _id: true }
);

const clientSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User account reference is required'],
      unique: true,
      index: true
    },
    businessName: {
      type: String,
      required: [true, 'Business or Shop name is required'],
      trim: true,
      minlength: [2, 'Business name must be at least 2 characters'],
      maxlength: [150, 'Business name cannot exceed 150 characters'],
      index: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
      index: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
    },
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
      sparse: true,
      validate: {
        validator: function (v) {
          if (!v || v.trim() === '') return true
          return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v)
        },
        message: 'Please provide a valid 15-character GSTIN number',
      },
    },
    installationAddress: {
      address: {
        type: String,
        required: [true, 'Installation street address is required'],
        trim: true
      },
      city: {
        type: String,
        required: [true, 'City is required'],
        trim: true
      },
      pincode: {
        type: String,
        required: [true, 'Pincode is required'],
        trim: true,
        match: [/^[0-9]{6}$/, 'Pincode must be 6 digits']
      },
      state: {
        type: String,
        default: 'Madhya Pradesh',
        trim: true
      }
    },
    cameras: [cameraDetailSchema],
    totalCamerasInstalled: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: {
        values: Object.values(ClientStatus),
        message: 'Invalid client status'
      },
      default: ClientStatus.ACTIVE,
      index: true
    },
    currentSubscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClientSubscription',
      default: null
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

clientSchema.pre('save', function (next) {
  if (this.cameras) {
    this.totalCamerasInstalled = this.cameras.length;
  }
  next();
});

clientSchema.index({ businessName: 1, status: 1 });
clientSchema.index({ 'installationAddress.city': 1 });
clientSchema.index({ createdAt: -1 });

export const ClientModel = mongoose.models.Client || mongoose.model('Client', clientSchema);
