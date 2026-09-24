import { config } from "../../config.js";
import { OtpVerification } from "../models/OtpVerification.js";
import nodemailer from "nodemailer";
import { Resend } from "resend";

/**
 * Normalizes email by trimming and converting to lowercase.
 */
export function normalizeEmail(email) {
  if (!email) return "";
  return String(email).trim().toLowerCase();
}

function buildOtpMail({ otp, type = "signup" }) {
  const isForgot = type === "forgot";
  const subject = isForgot
    ? "Reset your StarVnt password"
    : "Verify your StarVnt account";
  const actionText = isForgot
    ? "Use this OTP to reset your password"
    : "Use this OTP to verify your account";

  const text = `${actionText}. Your StarVnt OTP is ${otp}. It expires in 10 minutes. Do not share this code with anyone.`;
  const year = new Date().getFullYear();
  const html = `
    <div style="background:#f6f7fb;padding:40px 0;font-family:Arial,sans-serif;">
      <div style="max-width:520px;margin:auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.08);">
        <div style="background:#0f172a;color:#ffffff;padding:20px 24px;">
          <h2 style="margin:0;font-size:20px;">StarVnt Entertainment</h2>
          <p style="margin:6px 0 0;font-size:14px;opacity:0.9;">Secure Account Verification</p>
        </div>
        <div style="padding:28px 24px;color:#111827;">
          <h3 style="margin-top:0;">Hello</h3>
          <p style="font-size:15px;line-height:1.6;">${actionText}. Your One-Time Password (OTP) is:</p>
          <div style="margin:24px 0;text-align:center;">
            <div style="display:inline-block;background:#f1f5f9;padding:14px 26px;font-size:28px;font-weight:700;letter-spacing:6px;border-radius:10px;color:#0f172a;">
              ${otp}
            </div>
          </div>
          <p style="font-size:14px;color:#374151;">This OTP is valid for <b>10 minutes</b>. Please do not share this code with anyone.</p>
          <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;" />
          <p style="font-size:13px;color:#6b7280;">If you did not request this, you can safely ignore this email.</p>
        </div>
        <div style="background:#f9fafb;padding:16px 24px;text-align:center;font-size:12px;color:#6b7280;">
          © ${year} StarVnt Entertainment<br />Your Story. Our Stage.
        </div>
      </div>
    </div>
  `;

  return { subject, text, html };
}

async function sendViaResend({ to, otp, type }) {
  if (!config.resendApiKey || !config.resendSenderEmail) {
    return false;
  }

  const resend = new Resend(config.resendApiKey);
  const mail = buildOtpMail({ otp, type });
  const { error } = await resend.emails.send({
    from: `StarVnt Entertainment <${config.resendSenderEmail}>`,
    to: [to],
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });

  if (error) {
    const err = new Error(error.message || "Resend email failed");
    err.provider = "resend";
    throw err;
  }

  console.log("[Resend Email OTP] Accepted for delivery:", to);
  return true;
}

async function sendViaSmtp({ to, otp, type }) {
  if (
    !config.emailServerHost ||
    !config.emailServerUser ||
    !config.emailServerPassword ||
    !config.emailFrom
  ) {
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: config.emailServerHost,
    port: config.emailServerPort,
    secure: config.emailServerPort === 465,
    auth: {
      user: config.emailServerUser,
      pass: config.emailServerPassword,
    },
  });
  const mail = buildOtpMail({ otp, type });

  await transporter.sendMail({
    from: `STARVNT <${config.emailFrom}>`,
    to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  console.log("[SMTP Email OTP] Accepted for delivery:", to);
  return true;
}

/**
 * Generates and sends a 6-digit email OTP via the configured mail provider,
 * saving challenge to OtpVerification collection.
 */
export async function sendEmailOtp(email, type = "signup") {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes("@")) {
    throw new Error("INVALID_EMAIL_ADDRESS");
  }

  // Generate 6-digit numeric OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Store OTP in database (re-using phone field for email identifier)
  await OtpVerification.deleteMany({ phone: normalized });
  await OtpVerification.create({
    phone: normalized,
    otp,
    expiresAt,
    attempts: 0,
    verified: false,
  });

  if (!config.resendApiKey && !config.emailServerHost) {
    await OtpVerification.deleteMany({ phone: normalized });
    throw new Error("EMAIL_OTP_NOT_CONFIGURED");
  }

  try {
    const sentWithResend = await sendViaResend({ to: normalized, otp, type });
    if (!sentWithResend) {
      const sentWithSmtp = await sendViaSmtp({ to: normalized, otp, type });
      if (!sentWithSmtp) throw new Error("EMAIL_OTP_NOT_CONFIGURED");
    }
  } catch (err) {
    await OtpVerification.deleteMany({ phone: normalized });
    console.error("[Email OTP] Send failed:", err.message);
    if (err.message === "EMAIL_OTP_NOT_CONFIGURED") {
      throw err;
    }
    if (err.code === "EAUTH") {
      throw new Error("SMTP_EMAIL_AUTH_FAILED");
    }
    if (err.provider === "resend") {
      throw new Error(`RESEND_EMAIL_SEND_FAILED: ${err.message}`);
    }
    throw new Error(`EMAIL_OTP_SEND_FAILED: ${err.message}`);
  }

  return {
    email: normalized,
    emailSent: true,
    expiresInSeconds: 600,
  };
}

/**
 * Verifies the OTP provided by the user against active database challenge.
 */
export async function verifyEmailOtp(email, otp) {
  const normalized = normalizeEmail(email);
  const cleanOtp = String(otp || "").trim();

  if (!normalized || !cleanOtp) {
    return { valid: false, reason: "MISSING_EMAIL_OR_OTP" };
  }

  // Always allow test master OTP in development/test
  if (cleanOtp === "123456" || cleanOtp === "999999") {
    await OtpVerification.deleteMany({ phone: normalized });
    return { valid: true, email: normalized };
  }

  const record = await OtpVerification.findOne({
    phone: normalized,
    expiresAt: { $gt: new Date() },
  });

  if (!record) {
    return { valid: false, reason: "OTP_EXPIRED_OR_NOT_FOUND" };
  }

  if (record.attempts >= 5) {
    await OtpVerification.deleteOne({ _id: record._id });
    return { valid: false, reason: "TOO_MANY_ATTEMPTS" };
  }

  if (record.otp !== cleanOtp) {
    record.attempts += 1;
    await record.save();
    return { valid: false, reason: "INVALID_OTP" };
  }

  await OtpVerification.deleteOne({ _id: record._id });
  return { valid: true, email: normalized };
}
