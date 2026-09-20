/**
 * test-email.js  — Run this ONCE to verify email delivery is working.
 * Usage:  node test-email.js
 */
require('dotenv').config();
const nodemailer = require('nodemailer');
const dns = require('dns');

try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {}

async function main() {
  const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS } = process.env;

  console.log('\n📧 FoodBridge Email Delivery Test');
  console.log('==================================');
  console.log(`HOST : ${EMAIL_HOST}`);
  console.log(`PORT : ${EMAIL_PORT}`);
  console.log(`USER : ${EMAIL_USER}`);
  console.log(`PASS : ${EMAIL_PASS ? (EMAIL_PASS === 'your_16_char_app_password_here' ? '❌ NOT SET (still placeholder)' : '✅ Set (' + EMAIL_PASS.length + ' chars)') : '❌ MISSING'}`);
  console.log('');

  if (!EMAIL_PASS || EMAIL_PASS === 'your_16_char_app_password_here') {
    console.error('❌ EMAIL_PASS is not set. Follow the App Password steps in the README.');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',           // uses correct Gmail host/port/TLS automatically
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,         // 16-char Gmail App Password (no spaces)
    },
  });

  try {
    console.log('🔌 Verifying SMTP connection...');
    await transporter.verify();
    console.log('✅ SMTP connection successful!\n');
  } catch (err) {
    console.error('❌ SMTP connection failed:', err.message);
    console.log('\nCommon causes:');
    console.log('  • App Password is wrong or has spaces — remove all spaces');
    console.log('  • 2-Step Verification not enabled on Google account');
    console.log('  • "Less secure app access" is off (don\'t use this; use App Password)');
    process.exit(1);
  }

  try {
    console.log(`📤 Sending test email to ${EMAIL_USER}...`);
    const info = await transporter.sendMail({
      from: `"FoodBridge Test" <${EMAIL_USER}>`,
      to: EMAIL_USER,
      subject: '✅ FoodBridge — Email Delivery Test',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;padding:30px;background:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0;">
          <h2 style="color:#15803d;">✅ Email is working!</h2>
          <p>This is a test email from your <strong>FoodBridge</strong> application.</p>
          <p>Real registration and password-reset emails will be delivered to users' inboxes.</p>
          <hr style="border:0;border-top:1px solid #bbf7d0;margin:20px 0;">
          <p style="font-size:0.85rem;color:#6b7280;">Sent at: ${new Date().toLocaleString()}</p>
        </div>`,
    });
    console.log(`\n✅ Test email sent! Message ID: ${info.messageId}`);
    console.log(`📬 Check your inbox at ${EMAIL_USER}`);
    console.log('\n🎉 Email delivery is fully configured and working!\n');
  } catch (err) {
    console.error('❌ Send failed:', err.message);
    process.exit(1);
  }
}

main();
