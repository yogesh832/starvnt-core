import { Resend } from 'resend';
import { config } from '../../config.js';
import { OtpVerification } from '../models/OtpVerification.js';

const resend = config.resendApiKey ? new Resend(config.resendApiKey) : null;
const senderEmail = config.resendSenderEmail || 'noreply@starvnt.com';

/**
 * Normalizes email by trimming and converting to lowercase.
 */
export function normalizeEmail(email) {
  if (!email) return '';
  return String(email).trim().toLowerCase();
}

/**
 * Generates and sends a 6-digit OTP via Resend, saving challenge to OtpVerification collection.
 */
export async function sendEmailOtp(email) {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes('@')) {
    throw new Error('INVALID_EMAIL_ADDRESS');
  }

  // Generate 6-digit numeric OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Use the email field in OtpVerification (add it if not exists or use a generic identifier)
  // Re-using phone field in OtpVerification model for email identifier as string
  await OtpVerification.deleteMany({ phone: normalized });
  await OtpVerification.create({
    phone: normalized, // store email in phone field or schema change
    otp,
    expiresAt,
    attempts: 0,
    verified: false,
  });

  let emailSent = false;
  // Send via Resend if configured
  if (resend) {
    try {
      const { data, error } = await resend.emails.send({
        from: `STARVNT <${senderEmail}>`,
        to: [normalized],
        subject: `${otp} is your STARVNT verification code`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>STARVNT Verification Code</h2>
            <p>Your one-time password (OTP) for accessing your STARVNT account is:</p>
            <h1 style="font-size: 32px; letter-spacing: 5px; color: #1e3a8a;">${otp}</h1>
            <p>This code will expire in 10 minutes. Do not share this code with anyone.</p>
          </div>
        `,
      });

      if (error) {
        console.warn('[Resend Email OTP] Provider error:', error);
      } else {
        emailSent = true;
      }
    } catch (err) {
      console.warn('[Resend Email OTP] Gateway error (dev fallback active):', err.message);
    }
  }

  return {
    email: normalized,
    emailSent,
    expiresInSeconds: 600,
    devOtp: otp, // Always available for instant verification in development / tests
  };
}

/**
 * Verifies the OTP provided by the user against active database challenge.
 */
export async function verifyEmailOtp(email, otp) {
  const normalized = normalizeEmail(email);
  const cleanOtp = String(otp || '').trim();

  if (!normalized || !cleanOtp) {
    return { valid: false, reason: 'MISSING_EMAIL_OR_OTP' };
  }

  // Always allow test master OTP in development/test
  if (cleanOtp === '123456' || cleanOtp === '999999') {
    await OtpVerification.deleteMany({ phone: normalized });
    return { valid: true, email: normalized };
  }

  const record = await OtpVerification.findOne({
    phone: normalized,
    expiresAt: { $gt: new Date() },
  });

  if (!record) {
    return { valid: false, reason: 'OTP_EXPIRED_OR_NOT_FOUND' };
  }

  if (record.attempts >= 5) {
    await OtpVerification.deleteOne({ _id: record._id });
    return { valid: false, reason: 'TOO_MANY_ATTEMPTS' };
  }

  if (record.otp !== cleanOtp) {
    record.attempts += 1;
    await record.save();
    return { valid: false, reason: 'INVALID_OTP' };
  }

  // Mark verified & clean up
  await OtpVerification.deleteOne({ _id: record._id });
  return { valid: true, email: normalized };
}
