'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { getPool } = require('../db');
const { validateEmailDomain, sendVerificationEmail } = require('../services/emailService');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Save to public/uploads directory
    cb(null, path.join(__dirname, '../../public/uploads/'))
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
  }
});
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function generateJWT(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function makeVerificationToken() {
  return crypto.randomBytes(32).toString('hex');
}

function tokenExpiry() {
  return new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
}

function formatTimeTo24H(timeStr) {
  if (!timeStr) return null;
  // Expected format: "09:00 AM" or "05:00 PM"
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s+(AM|PM)/i);
  if (!match) return timeStr; 
  
  let hours = parseInt(match[1]);
  const minutes = match[2];
  const period = match[3].toUpperCase();
  
  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  
  return `${hours.toString().padStart(2, '0')}:${minutes}:00`;
}

// ─── RESEND VERIFICATION EMAIL ────────────────────────────────────────────────
router.post('/resend-verification', async (req, res) => {
  const { email, role } = req.body;
  if (!email || !role) {
    return res.status(400).json({ success: false, message: 'Email and role are required.' });
  }

  let tableName = '';
  let idColumn = '';
  if (role === 'restaurant') { tableName = 'restaurants'; idColumn = 'restaurant_id'; }
  else if (role === 'organization') { tableName = 'organizations'; idColumn = 'organization_id'; }
  else if (role === 'volunteer') { tableName = 'delivery_volunteers'; idColumn = 'volunteer_id'; }
  else return res.status(400).json({ success: false, message: 'Invalid role.' });

  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT ${idColumn}, email_verified FROM ${tableName} WHERE email = ?`,
      [email.trim().toLowerCase()]
    );

    // Always return the same message to prevent email enumeration
    const genericMsg = 'If that email is unverified, a new link has been sent.';
    if (rows.length === 0 || rows[0].email_verified) {
      return res.json({ success: true, message: genericMsg });
    }

    // Generate fresh token
    const verificationToken = makeVerificationToken();
    const verificationExpires = tokenExpiry();
    await pool.query(
      `UPDATE ${tableName} SET verification_token = ?, verification_token_expires = ? WHERE email = ?`,
      [verificationToken, verificationExpires, email.trim().toLowerCase()]
    );

    try {
      await sendVerificationEmail(email.trim().toLowerCase(), verificationToken);
      console.log(`✅ Verification email resent to ${email}`);
    } catch (emailErr) {
      console.error('Resend verification email error:', emailErr.message);
    }

    res.json({ success: true, message: genericMsg });
  } catch (err) {
    console.error('Resend verification error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── EMAIL VERIFICATION ROUTE ─────────────────────────────────────────────────
router.get('/verify-email', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ success: false, message: 'Verification token is missing.' });
  }

  try {
    const pool = getPool();

    // Try restaurants first
    const [rRows] = await pool.query(
      'SELECT restaurant_id FROM restaurants WHERE verification_token = ? AND verification_token_expires > NOW()',
      [token]
    );

    if (rRows.length > 0) {
      await pool.query(
        'UPDATE restaurants SET email_verified = 1, verification_token = NULL, verification_token_expires = NULL WHERE restaurant_id = ?',
        [rRows[0].restaurant_id]
      );
      console.log(`✅ Email verification successful for restaurant_id=${rRows[0].restaurant_id}`);
      return res.redirect('/auth?verified=1');
    }

    // Try organizations
    const [oRows] = await pool.query(
      'SELECT organization_id FROM organizations WHERE verification_token = ? AND verification_token_expires > NOW()',
      [token]
    );

    if (oRows.length > 0) {
      await pool.query(
        'UPDATE organizations SET email_verified = 1, verification_token = NULL, verification_token_expires = NULL WHERE organization_id = ?',
        [oRows[0].organization_id]
      );
      console.log(`✅ Email verification successful for organization_id=${oRows[0].organization_id}`);
      return res.redirect('/auth?verified=1');
    }

    // Try volunteers
    const [vRows] = await pool.query(
      'SELECT volunteer_id FROM delivery_volunteers WHERE verification_token = ? AND verification_token_expires > NOW()',
      [token]
    );

    if (vRows.length > 0) {
      await pool.query(
        'UPDATE delivery_volunteers SET email_verified = 1, account_status = "active", verification_token = NULL, verification_token_expires = NULL WHERE volunteer_id = ?',
        [vRows[0].volunteer_id]
      );
      console.log(`✅ Email verification successful for volunteer_id=${vRows[0].volunteer_id}`);
      return res.redirect('/auth?verified=1');
    }

    // Token not found or expired
    console.warn(`⚠️  Verification token invalid or expired: ${token.substring(0, 10)}...`);
    return res.status(400).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>Verification Failed – FoodBridge</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; background:#f9fafb; margin:0; }
          .card { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:40px 32px; max-width:420px; text-align:center; }
          h2 { color:#dc2626; } p { color:#374151; }
          a { color:#15803d; font-weight:bold; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>❌ Verification Failed</h2>
          <p>The verification link is <strong>invalid or has expired</strong> (links expire after 15 minutes).</p>
          <p>Please <a href="/auth">register again</a> to receive a new verification email.</p>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Email verification error:', err);
    return res.status(500).json({ success: false, message: 'Server error during verification.' });
  }
});

// ─── RESTAURANT REGISTER ───────────────────────────────────────────────────────
router.post('/restaurant/register', async (req, res) => {
  try {
    const { name, email, phone, address, password, working_hours } = req.body;

    if (!name || !email || !phone || !address || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    // DNS MX validation
    const { valid, reason } = await validateEmailDomain(email);
    if (!valid) {
      return res.status(400).json({ success: false, message: reason });
    }

    const { passed, rules } = validatePassword(password);
    if (!passed) {
      return res.status(400).json({ success: false, message: 'Password does not meet requirements.', rules });
    }

    const pool = getPool();
    const [existing] = await pool.query('SELECT restaurant_id FROM restaurants WHERE email = ?', [email.trim().toLowerCase()]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const verificationToken = makeVerificationToken();
    const verificationExpires = tokenExpiry();

    const [result] = await pool.query(
      `INSERT INTO restaurants (name, email, phone, address, password_hash, working_hours, email_verified, verification_token, verification_token_expires)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [name.trim(), email.trim().toLowerCase(), phone.trim(), address.trim(), password_hash,
       working_hours ? working_hours.trim() : null, verificationToken, verificationExpires]
    );

    // Send verification email (non-fatal if SMTP fails)
    try {
      await sendVerificationEmail(email.trim().toLowerCase(), verificationToken);
    } catch (emailErr) {
      console.error('Verification email failed to send (registration still succeeded):', emailErr.message);
    }

    res.status(201).json({
      success: true,
      message: 'Registration successful! Please check your email to verify your account before logging in.',
      user: { id: result.insertId, name, email, role: 'restaurant' },
    });
  } catch (err) {
    console.error('Restaurant register error:', err);
    res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
});

// ─── RESTAURANT LOGIN ───────────────────────────────────────────────────────────
router.post('/restaurant/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM restaurants WHERE email = ?', [email.trim().toLowerCase()]);
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'mail id not found' });
    }

    const restaurant = rows[0];

    const match = await bcrypt.compare(password, restaurant.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    // Block login if email not verified
    if (!restaurant.email_verified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before logging in. Check your inbox for the verification link.',
      });
    }

    const token = generateJWT({
      id: restaurant.restaurant_id,
      email: restaurant.email,
      name: restaurant.name,
      role: 'restaurant',
    });
    res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: { id: restaurant.restaurant_id, name: restaurant.name, email: restaurant.email, role: 'restaurant' },
    });
  } catch (err) {
    console.error('Restaurant login error:', err);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

// ─── ORGANIZATION REGISTER ─────────────────────────────────────────────────────
router.post('/organization/register', async (req, res) => {
  try {
    const { name, email, phone, address, password, org_type, sector, people_count } = req.body;

    if (!name || !email || !phone || !address || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    // DNS MX validation
    const { valid, reason } = await validateEmailDomain(email);
    if (!valid) {
      return res.status(400).json({ success: false, message: reason });
    }

    const { passed, rules } = validatePassword(password);
    if (!passed) {
      return res.status(400).json({ success: false, message: 'Password does not meet requirements.', rules });
    }

    const pool = getPool();
    const [existing] = await pool.query('SELECT organization_id FROM organizations WHERE email = ?', [email.trim().toLowerCase()]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const verificationToken = makeVerificationToken();
    const verificationExpires = tokenExpiry();

    const [result] = await pool.query(
      `INSERT INTO organizations (name, email, phone, address, password_hash, org_type, sector, people_count, email_verified, verification_token, verification_token_expires)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [name.trim(), email.trim().toLowerCase(), phone.trim(), address.trim(), password_hash,
       org_type || null, sector || null, people_count ? parseInt(people_count) : null,
       verificationToken, verificationExpires]
    );

    // Send verification email (non-fatal if SMTP fails)
    try {
      await sendVerificationEmail(email.trim().toLowerCase(), verificationToken);
    } catch (emailErr) {
      console.error('Verification email failed to send (registration still succeeded):', emailErr.message);
    }

    res.status(201).json({
      success: true,
      message: 'Registration successful! Please check your email to verify your account before logging in.',
      user: { id: result.insertId, name, email, role: 'organization' },
    });
  } catch (err) {
    console.error('Organization register error:', err);
    res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
});

// ─── ORGANIZATION LOGIN ────────────────────────────────────────────────────────
router.post('/organization/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM organizations WHERE email = ?', [email.trim().toLowerCase()]);
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'mail id not found' });
    }

    const org = rows[0];

    const match = await bcrypt.compare(password, org.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    // Block login if email not verified
    if (!org.email_verified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before logging in. Check your inbox for the verification link.',
      });
    }

    const token = generateJWT({
      id: org.organization_id,
      email: org.email,
      name: org.name,
      role: 'organization',
    });
    res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: { id: org.organization_id, name: org.name, email: org.email, role: 'organization' },
    });
  } catch (err) {
    console.error('Organization login error:', err);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

// ─── ADMIN LOGIN ───────────────────────────────────────────────────────────────
router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM admins WHERE email = ?', [email.trim().toLowerCase()]);
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'mail id not found' });
    }

    const admin = rows[0];
    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const token = generateJWT({
      id: admin.admin_id,
      email: admin.email,
      name: admin.name,
      role: 'administrator',
    });
    res.json({
      success: true,
      message: 'Admin login successful.',
      token,
      user: { id: admin.admin_id, name: admin.name, email: admin.email, role: 'administrator' },
    });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

// ─── VOLUNTEER REGISTER ────────────────────────────────────────────────────────
router.post('/volunteer/register', upload.single('license_file'), async (req, res) => {
  try {
    const { name, email, phone, age, gender, vehicle_type, vehicle_number, address, password, working_hours_start, working_hours_end, emergency_contact, government_id } = req.body;

    if (!name || !email || !phone || !age || !gender || !vehicle_type || !vehicle_number || !address || !password || !working_hours_start || !working_hours_end || !emergency_contact) {
      return res.status(400).json({ success: false, message: 'All required fields must be provided.' });
    }

    const parsedAge = parseInt(age, 10);
    if (isNaN(parsedAge) || parsedAge < 18) {
      return res.status(400).json({ success: false, message: 'Volunteer must be at least 18 years old.' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Driving license file is required.' });
    }

    // DNS MX validation
    const { valid, reason } = await validateEmailDomain(email);
    if (!valid) {
      return res.status(400).json({ success: false, message: reason });
    }

    const { passed, rules } = validatePassword(password);
    if (!passed) {
      return res.status(400).json({ success: false, message: 'Password does not meet requirements.', rules });
    }

    const pool = getPool();
    const [existing] = await pool.query('SELECT volunteer_id FROM delivery_volunteers WHERE email = ?', [email.trim().toLowerCase()]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const verificationToken = makeVerificationToken();
    const verificationExpires = tokenExpiry();
    
    // Convert time formats to 24-hour style for MySQL TIME column
    const startTime24 = formatTimeTo24H(working_hours_start);
    const endTime24   = formatTimeTo24H(working_hours_end);

    // License upload check should be managed by multer in the route, simulated path here
    const license_file_path = `/uploads/${req.file.filename}`; 

    const [result] = await pool.query(
      `INSERT INTO delivery_volunteers (full_name, email, phone, age, gender, vehicle_type, vehicle_number, government_id, license_file_path, address, working_hours_start, working_hours_end, emergency_contact, password_hash, email_verified, verification_token, verification_token_expires, account_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'inactive')`,
      [name.trim(), email.trim().toLowerCase(), phone.trim(), parsedAge, gender, vehicle_type, vehicle_number.trim(), government_id || null, license_file_path, address.trim(), startTime24, endTime24, emergency_contact.trim(), password_hash, verificationToken, verificationExpires]
    );


    try {
      await sendVerificationEmail(email.trim().toLowerCase(), verificationToken);
    } catch (emailErr) {
      console.error('Verification email failed to send:', emailErr.message);
    }

    res.status(201).json({
      success: true,
      message: 'Registration successful! Please check your email to verify your account before logging in.',
      user: { id: result.insertId, name, email, role: 'volunteer' },
    });
  } catch (err) {
    console.error('Volunteer register error:', err);
    res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
});

// ─── VOLUNTEER LOGIN ───────────────────────────────────────────────────────────
router.post('/volunteer/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM delivery_volunteers WHERE email = ?', [email.trim().toLowerCase()]);
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'mail id not found' });
    }

    const volunteer = rows[0];

    const match = await bcrypt.compare(password, volunteer.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    if (!volunteer.email_verified || volunteer.account_status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before logging in. Check your inbox for the verification link.',
      });
    }

    const token = generateJWT({
      id: volunteer.volunteer_id,
      email: volunteer.email,
      name: volunteer.full_name,
      role: 'volunteer',
    });
    
    res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: { id: volunteer.volunteer_id, name: volunteer.full_name, email: volunteer.email, role: 'volunteer' },
    });
  } catch (err) {
    console.error('Volunteer login error:', err);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

module.exports = router;

