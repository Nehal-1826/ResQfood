'use strict';

require('dotenv').config();
const nodemailer = require('nodemailer');
const dns = require('dns').promises;
const dnsSync = require('dns');

// Prioritize IPv4 for socket/SMTP connections (prevents IPv6 getaddrinfo/timeout issues)
try {
  dnsSync.setDefaultResultOrder('ipv4first');
} catch (e) {
  // Ignore on older Node versions without setDefaultResultOrder
}

// ─── Well-known email providers (skips DNS lookup for these) ──────────────────
const KNOWN_PROVIDERS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.co.uk',
  'outlook.com', 'hotmail.com', 'hotmail.co.uk', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'protonmail.com', 'proton.me',
  'zoho.com', 'aol.com', 'yandex.com', 'yandex.ru', 'rediffmail.com',
]);

function getTransporter() {
  const user = (process.env.EMAIL_USER || '').trim();
  const pass = (process.env.EMAIL_PASS || '').trim().replace(/\s+/g, '');
  const PLACEHOLDER = 'your_16_char_app_password_here';

  if (!user || !pass || pass === PLACEHOLDER || pass.length < 16) {
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

// ─── Console Fallback ─────────────────────────────────────────────────────────
function consoleFallback(type, to, url) {
  const bar = '═'.repeat(74);
  const label = type === 'verify'
    ? '📧  VERIFICATION LINK  —  copy into browser to verify account'
    : '🔑  PASSWORD RESET LINK  —  copy into browser to reset password';
  console.log(`\n╔${bar}╗`);
  console.log(`║  ${label}`);
  console.log(`╠${bar}╣`);
  console.log(`║  TO  : ${to}`);
  console.log(`║  URL : ${url}`);
  console.log(`╠${bar}╣`);
  console.log(`║  ℹ   Gmail App Password not set or invalid → set EMAIL_PASS in .env for real delivery`);
  console.log(`╚${bar}╝\n`);
}

// ─── Verify SMTP Connection (called at server startup) ────────────────────────
async function verifyConnection() {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn('⚠️  EMAIL_PASS not configured — emails will be printed to terminal (console-fallback mode).');
    console.warn('   See README or run: node test-email.js  for setup instructions.');
    return;
  }
  try {
    await transporter.verify();
    console.log(`✅ Gmail SMTP verified — real emails will be sent from ${process.env.EMAIL_USER}`);
  } catch (err) {
    console.error('❌ Gmail SMTP failed:', err.message);
    if (err.message.includes('535') || err.message.includes('BadCredentials')) {
      console.error('   → Your App Password is wrong or revoked. Re-generate it at: https://myaccount.google.com/apppasswords');
    }
    console.warn('   Falling back to console mode. Fix EMAIL_PASS in .env and restart.');
  }
}

// ─── DNS MX Validation ────────────────────────────────────────────────────────
async function validateEmailDomain(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, reason: 'Invalid email format.' };
  }
  const domain = email.split('@')[1].toLowerCase();

  // Whitelist: skip DNS for known providers
  if (KNOWN_PROVIDERS.has(domain)) return { valid: true };

  // Unknown domains: try DNS with 3-second timeout, default to valid on failure
  try {
    const mxPromise = dns.resolveMx(domain);
    const timeout  = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000));
    const records  = await Promise.race([mxPromise, timeout]);
    if (!records || records.length === 0) {
      return { valid: false, reason: `No mail server found for domain "${domain}".` };
    }
    return { valid: true };
  } catch {
    console.warn(`⚠️  MX lookup failed for "${domain}" — allowing registration`);
    return { valid: true };   // fail-open: never block a user due to DNS issues
  }
}

// ─── HTML Email Template ──────────────────────────────────────────────────────
function makeHtml({ title, heading, body, buttonText, buttonUrl, buttonColor }) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#15803d,#22c55e);padding:32px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:1.8rem;letter-spacing:-0.5px;">🍽️ ResQfood</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:0.9rem;">Connecting surplus food to communities in need</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:36px 40px;">
          <h2 style="color:#111827;margin:0 0 12px;font-size:1.25rem;">${heading}</h2>
          <div style="color:#374151;font-size:0.95rem;line-height:1.7;">${body}</div>
          <!-- CTA Button -->
          <div style="text-align:center;margin:32px 0;">
            <a href="${buttonUrl}"
               style="background:${buttonColor};color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:700;font-size:1rem;display:inline-block;letter-spacing:0.02em;">
              ${buttonText}
            </a>
          </div>
          <!-- Fallback URL -->
          <p style="color:#6b7280;font-size:0.8rem;margin-bottom:4px;">Or copy this link into your browser:</p>
          <p style="word-break:break-all;font-size:0.78rem;color:${buttonColor};margin:0;">${buttonUrl}</p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:0.78rem;">
            ⏱ <strong>${title}</strong> &mdash; This link expires in <strong>15 minutes</strong>.<br>
            If you did not initiate this, you can safely ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ─── Send Verification Email ──────────────────────────────────────────────────
async function sendVerificationEmail(toEmail, token) {
  const base = (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
  const verifyUrl = `${base}/api/auth/verify-email?token=${token}`;
  const transporter = getTransporter();

  if (!transporter) {
    consoleFallback('verify', toEmail, verifyUrl);
    return;
  }

  const from = `"ResQfood" <${process.env.EMAIL_USER || 'noreply@resqfood.local'}>`;
  const html = makeHtml({
    title:       'Email Verification',
    heading:     'Verify your ResQfood account',
    body:        'Thank you for registering! Click the button below to verify your email address and activate your account. This helps us keep ResQfood safe for all users.',
    buttonText:  'Verify My Email Address',
    buttonUrl:   verifyUrl,
    buttonColor: '#15803d',
  });

  try {
    const info = await transporter.sendMail({
      from,
      to:      toEmail,
      subject: '✅ Verify your ResQfood email address',
      html,
      text:    `Verify your ResQfood account\n\nClick this link to verify:\n${verifyUrl}\n\nExpires in 15 minutes.`,
    });
    console.log(`✅ Verification email sent → ${toEmail}  (id: ${info.messageId})`);
  } catch (err) {
    console.error(`❌ Verification email failed for ${toEmail}:`, err.message);
    consoleFallback('verify', toEmail, verifyUrl);
  }
}

// ─── Send Password Reset Email ────────────────────────────────────────────────
async function sendPasswordResetEmail(toEmail, token) {
  const base = (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
  const resetUrl = `${base}/reset-password?token=${token}`;
  const transporter = getTransporter();

  if (!transporter) {
    consoleFallback('reset', toEmail, resetUrl);
    return;
  }

  const from = `"ResQfood" <${process.env.EMAIL_USER || 'noreply@resqfood.local'}>`;
  const html = makeHtml({
    title:       'Password Reset',
    heading:     'Reset your ResQfood password',
    body:        'We received a request to reset the password for your ResQfood account. Click the button below to choose a new password. If you did not make this request, you can safely ignore this email.',
    buttonText:  'Reset My Password',
    buttonUrl:   resetUrl,
    buttonColor: '#dc2626',
  });

  try {
    const info = await transporter.sendMail({
      from,
      to:      toEmail,
      subject: '🔑 ResQfood — Password reset request',
      html,
      text:    `Reset your ResQfood password\n\nClick this link:\n${resetUrl}\n\nExpires in 15 minutes. Ignore if you didn't request this.`,
    });
    console.log(`✅ Password reset email sent → ${toEmail}  (id: ${info.messageId})`);
  } catch (err) {
    console.error(`❌ Password reset email failed for ${toEmail}:`, err.message);
    consoleFallback('reset', toEmail, resetUrl);
  }
}

module.exports = {
  verifyConnection,
  validateEmailDomain,
  sendVerificationEmail,
  sendPasswordResetEmail,
};
