'use strict';

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getPool } = require('../db');
const { sendPasswordResetEmail } = require('../services/emailService');

const router = express.Router();

// ─── Password validation ──────────────────────────────────────────────────────
function validatePassword(password) {
  const rules = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  };
  const passed = Object.values(rules).every(Boolean);
  return { passed, rules };
}

// ─── REQUEST PASSWORD RESET ────────────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email, role } = req.body;
    if (!email || !role) {
      return res.status(400).json({ success: false, message: 'Email and role are required.' });
    }

    const pool = getPool();

    let tableName = '';
    if (role === 'restaurant') tableName = 'restaurants';
    else if (role === 'organization') tableName = 'organizations';
    else if (role === 'volunteer') tableName = 'delivery_volunteers';
    else if (role === 'administrator') {
      return res.status(403).json({ success: false, message: 'Password reset is not available for administrators. Contact the system owner.' });
    }
    else return res.status(400).json({ success: false, message: 'Invalid role.' });

    // Always return generic response (prevents email enumeration)
    const genericMsg = 'If the email exists, a reset link has been sent.';

    const [users] = await pool.query(`SELECT email FROM ${tableName} WHERE email = ?`, [email.trim().toLowerCase()]);
    if (users.length === 0) {
      return res.json({ success: true, message: genericMsg });
    }

    // Generate secure token — 15 minute expiry
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      'INSERT INTO password_resets (email, token, user_type, expires_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE token = VALUES(token), expires_at = VALUES(expires_at)',
      [email.trim().toLowerCase(), token, role, expiresAt]
    );

    // Send email via real SMTP (non-fatal — generic response either way)
    try {
      await sendPasswordResetEmail(email.trim().toLowerCase(), token);
      console.log(`✅ Password reset email sent to ${email}`);
    } catch (emailErr) {
      console.error(`❌ Password reset email failed for ${email}:`, emailErr.message);
    }

    res.json({ success: true, message: genericMsg });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ success: false, message: 'Server error while processing request.' });
  }
});

// ─── RESET PASSWORD ────────────────────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Token and new password are required.' });
    }

    const { passed, rules } = validatePassword(newPassword);
    if (!passed) {
      return res.status(400).json({ success: false, message: 'Password does not meet requirements.', rules });
    }

    const pool = getPool();

    // Validate token — must exist and not be expired
    const [resets] = await pool.query(
      'SELECT * FROM password_resets WHERE token = ? AND expires_at > NOW()',
      [token]
    );

    if (resets.length === 0) {
      console.warn(`⚠️  Password reset attempted with invalid/expired token: ${token.substring(0, 10)}...`);
      return res.status(400).json({ success: false, message: 'Invalid or expired password reset token.' });
    }

    const { email, user_type } = resets[0];

    let tableName = '';
    if (user_type === 'restaurant') tableName = 'restaurants';
    else if (user_type === 'organization') tableName = 'organizations';
    else if (user_type === 'volunteer') tableName = 'delivery_volunteers';
    else if (user_type === 'administrator') tableName = 'admins';

    // Hash and update password
    const password_hash = await bcrypt.hash(newPassword, 12);
    await pool.query(`UPDATE ${tableName} SET password_hash = ? WHERE email = ?`, [password_hash, email]);

    // Invalidate token
    await pool.query('DELETE FROM password_resets WHERE token = ?', [token]);

    console.log(`✅ Password reset successful for ${email} (${user_type})`);
    res.json({ success: true, message: 'Password has been successfully reset. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, message: 'Server error while resetting password.' });
  }
});

module.exports = router;
