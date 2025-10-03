import mongoose from "mongoose";
import enums from "../config/enum.config.js";
import passportLocalMongoose from "passport-local-mongoose";
import config from "../config/config.js";
import speakeasy from "speakeasy";

const notificationPreferencesSchema = new mongoose.Schema(
  {
    push: { type: Boolean, default: true },
    email: { type: Boolean, default: false },
    sms: { type: Boolean, default: false },
  },
  { _id: false }
);

const schema = new mongoose.Schema(
  {
    inviteCode: {
      type: String,
      default: null,
    },
    email: {
      type: String,
      default: null,
    },
    password: {
      type: String,
      default: null,
    },
    fullName: {
      type: String,
      default: null,
    },
    profileImage: {
      type: String,
      default: null,
    },
    providerId: {
      type: String,
      default: null,
    },
    provider: {
      type: String,
      enum: Object.values(enums.authProviderEnum),
    },
    otp: {
      type: Number,
      default: null,
    },
    role: {
      type: [String],
      enum: Object.values(enums.userRoleEnum),
      default: [enums.userRoleEnum.USER],
    },

    otpExpiresAt: {
      type: Date,
      default: null,
    },
    is_deleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    is_active: {
      type: Boolean,
      default: false,
      index: true,
    },
    is_verified: {
      type: Boolean,
      default: false,
      index: true,
    },
    otpVerified: {
      type: Boolean,
      default: false,
    },
    expiresIn: {
      type: String,
      default: null,
    },
    secretKey: {
      type: String,
    },
    twoFactorQr: {
      type: String,
    },
    isTwoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    myCaregivers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User", // These users can view MY health data
      },
    ],
    iCareFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User", // I can view THEIR health data (I'm a caregiver for them)
      },
    ],
    recoveryCode: [{ type: String }],
    fcmToken: { type: String, default: null },
    isBlocked: { type: Boolean, default: false },
    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    privacySettings: {
      enableDataSharing: { type: Boolean, default: false },
      analyticsConsent: { type: Boolean, default: false },
    },

    // --- for admin ---
    superadminApproveStatus: {
      type: String,
      enum: Object.values(enums.superadminApproveStatusEnum),
      default: enums.superadminApproveStatusEnum.PENDING,
    },
    gender: {
      type: String,
      enum: Object.values(enums.genderEnums),
      default: null,
    },

    // --- notification preferences ---
    notificationPreferences: {
      preferences: {
        medications: {
          type: notificationPreferencesSchema,
          default: () => ({}),
        },
        waterIntake: {
          type: notificationPreferencesSchema,
          default: () => ({}),
        },
        exercise: { type: notificationPreferencesSchema, default: () => ({}) },
        other: { type: notificationPreferencesSchema, default: () => ({}) },
      },
      reminderFrequency: {
        type: String,
        enum: Object.values(enums.notificationFrequencyEnum),
        default: enums.notificationFrequencyEnum.DAILY,
      },
    },

    // --- for doctor ---
    experience: { type: Number, default: 0 },
    phoneNumber: { type: String, default: null },
    countryCode: { type: String, default: null },
    description: { type: String, default: null },
    specialization: [String],
    qualifications: [String],

    // --- premium features ---
    isSubscribed: { type: Boolean, default: false },
    subscriptionStatus: {
      type: String,
      default: "",
    },
    subscriptionStartDate: { type: Date, default: null },
    subscriptionEndDate: { type: Date, default: null },
    subscriptionType: {
      type: String,
      enum: Object.values(enums.subscriptionTypeEnum),
      default: enums.subscriptionTypeEnum.FREE,
    },
    is_premium: { type: Boolean, default: false },
    stripeCustomerId: { type: String, default: null },
    stripeSubscriptionId: { type: String, default: null },
    lastPaymentDate: { type: Date, default: null },
    stripeDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    subscriptionPurchasedAt: {
      type: Date,
      default: null,
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
    paymentStatus: {
      type: String,
      enum: Object.values(enums.paymentStatusEnum),
      default: enums.paymentStatusEnum.PENDING,
      index: true,
    },
    subscriptionDetails: {
      planId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Plan",
        default: null,
      },
      planName: { type: String, default: null }, // e.g. "Pro"
      planLabel: { type: String, default: null }, // e.g. "Pro Plan"
      price: { type: Number, default: 0 }, // e.g. 29.99
      currency: { type: String, default: null },
      interval: {
        type: String,
        enum: Object.values(enums.intervalEnum),
        default: null,
      },
      status: {
        type: String,
        enum: Object.values(enums.subscriptionStatusEnum),
        default: null,
      },
    },

    is_caregiver_block: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

schema.index({ provider: 1, providerId: 1 });
schema.plugin(passportLocalMongoose, { usernameField: "email" });

// Method to enable 2FA and generate QR code
schema.methods.enableTwoFactorAuthentication = async function () {
  if (!this.secretKey) {
    const secret = speakeasy.generateSecret({
      length: 20,
      name: config.appName,
    });
    this.secretKey = secret.base32;

    await this.save();

    // Generate QR code for user to scan with Google Authenticator
    const qrCode = await QRCode.toDataURL(secret.otpauth_url);
    return { secret: secret.base32, qrCode };
  }

  return null;
};

const UserModel = mongoose.model("User", schema);
export default UserModel;
