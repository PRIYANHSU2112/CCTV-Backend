import mongoose from 'mongoose';
import { UserRole, UserStatus } from '../../shared/constants/enum.constant.js';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters']
    },
    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username cannot exceed 30 characters']
    },
    phone: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
      trim: true,
      index: true
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
    },
    password: {
      type: String,
      required: false,
      select: false
    },
    role: {
      type: String,
      // No enum constraint — supports both built-in roles (SUPER_ADMIN, ACCOUNTS_MANAGER, OPERATIONS_TEAM, CLIENT)
      // and custom DB-stored roles (e.g. SUB_ADMIN, BILLING_MANAGER) created via the RBAC module
      trim: true,
      uppercase: true,
      default: UserRole.CLIENT,
      required: true
    },
    status: {
      type: String,
      enum: {
        values: Object.values(UserStatus),
        message: 'Invalid user status'
      },
      default: UserStatus.ACTIVE,
      required: true
    },
    lastLogin: {
      type: Date,
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
        delete ret.password;
        return ret;
      }
    }
  }
);

userSchema.index({ role: 1 });
userSchema.index({ status: 1 });
userSchema.index({ createdAt: -1 });

export const UserModel = mongoose.models.User || mongoose.model('User', userSchema);
