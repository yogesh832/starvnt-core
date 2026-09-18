import mongoose from 'mongoose';
import { externalConn } from '../../db/index.js';

const { Schema } = mongoose;

/**
 * ExternalUserDB.OtpVerifications — Mobile phone OTP challenges for customer & vendor sign-in.
 * Auto-expiring TTL index (10 minutes).
 */
const otpVerificationSchema = new Schema(
  {
    phone: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    otp: {
      type: String,
      required: true,
      trim: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

export const OtpVerification = externalConn.model('OtpVerification', otpVerificationSchema);
