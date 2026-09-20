// src/routes/profileRoutes.js
const express = require('express');
const { getPool } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// ─── GET RESTAURANT PROFILE ──────────────────────────────────────────────────
router.get('/restaurant', authMiddleware, requireRole('restaurant'), async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT name, email, phone, address, working_hours FROM restaurants WHERE restaurant_id = ?',
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Restaurant not found.' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Fetch restaurant profile error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch restaurant profile.' });
  }
});

// ─── UPDATE RESTAURANT PROFILE ───────────────────────────────────────────────
router.put('/restaurant', authMiddleware, requireRole('restaurant'), async (req, res) => {
  try {
    const { name, phone, address, working_hours } = req.body;
    
    if (!name || !phone || !address) {
      return res.status(400).json({ success: false, message: 'Name, phone, and address are required.' });
    }

    const pool = getPool();
    await pool.query(
      'UPDATE restaurants SET name = ?, phone = ?, address = ?, working_hours = ? WHERE restaurant_id = ?',
      [name.trim(), phone.trim(), address.trim(), working_hours ? working_hours.trim() : null, req.user.id]
    );

    res.json({ success: true, message: 'Profile updated successfully.' });
  } catch (err) {
    console.error('Update restaurant profile error:', err);
    res.status(500).json({ success: false, message: 'Failed to update restaurant profile.' });
  }
});

// ─── GET ORGANIZATION PROFILE ────────────────────────────────────────────────
router.get('/organization', authMiddleware, requireRole('organization'), async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT name, email, phone, address, org_type, sector, people_count FROM organizations WHERE organization_id = ?',
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Organization not found.' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Fetch organization profile error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch organization profile.' });
  }
});

// ─── UPDATE ORGANIZATION PROFILE ─────────────────────────────────────────────
router.put('/organization', authMiddleware, requireRole('organization'), async (req, res) => {
  try {
    const { name, phone, address, org_type, sector, people_count } = req.body;

    if (!name || !phone || !address) {
      return res.status(400).json({ success: false, message: 'Name, phone, and address are required.' });
    }

    const pool = getPool();
    await pool.query(
      'UPDATE organizations SET name = ?, phone = ?, address = ?, org_type = ?, sector = ?, people_count = ? WHERE organization_id = ?',
      [name.trim(), phone.trim(), address.trim(), org_type || null, sector || null, people_count ? parseInt(people_count) : null, req.user.id]
    );

    res.json({ success: true, message: 'Profile updated successfully.' });
  } catch (err) {
    console.error('Update organization profile error:', err);
    res.status(500).json({ success: false, message: 'Failed to update organization profile.' });
  }
});
// ─── HELPERS ─────────────────────────────────────────────────────────────────
function to24Hour(timeStr) {
  if (!timeStr) return null;
  // expects "HH:MM AM/PM"
  const [time, modifier] = timeStr.split(' ');
  let [hours, minutes] = time.split(':');
  if (hours === '12') hours = '00';
  if (modifier === 'PM') hours = parseInt(hours, 10) + 12;
  return `${hours.toString().padStart(2, '0')}:${minutes}:00`;
}

function to12Hour(timeStr) {
  if (!timeStr) return null;
  // expects "HH:MM:SS"
  let [hours, minutes] = timeStr.split(':');
  const modifier = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours.toString().padStart(2, '0')}:${minutes} ${modifier}`;
}

// ─── GET VOLUNTEER PROFILE ───────────────────────────────────────────────────
router.get('/volunteer', authMiddleware, requireRole('volunteer'), async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT full_name as name, email, phone, age, gender, vehicle_type, vehicle_number, government_id, address, working_hours_start, working_hours_end, emergency_contact FROM delivery_volunteers WHERE volunteer_id = ?',
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Volunteer not found.' });
    }

    const data = rows[0];
    // Convert TIME from DB to 12-hour format for frontend dropdowns
    data.working_hours_start = to12Hour(data.working_hours_start);
    data.working_hours_end = to12Hour(data.working_hours_end);

    res.json({ success: true, data });
  } catch (err) {
    console.error('Fetch volunteer profile error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch volunteer profile.' });
  }
});

// ─── UPDATE VOLUNTEER PROFILE ────────────────────────────────────────────────
router.put('/volunteer', authMiddleware, requireRole('volunteer'), async (req, res) => {
  try {
    const { name, phone, age, gender, vehicle_type, vehicle_number, government_id, address, working_hours_start, working_hours_end, emergency_contact } = req.body;

    if (!name || !phone || !age || !gender || !vehicle_type || !vehicle_number || !address || !working_hours_start || !working_hours_end || !emergency_contact) {
      return res.status(400).json({ success: false, message: 'All required fields must be provided.' });
    }

    const parsedAge = parseInt(age, 10);
    if (isNaN(parsedAge) || parsedAge < 18) {
      return res.status(400).json({ success: false, message: 'Volunteer must be at least 18 years old.' });
    }

    // Convert working hours from 12-hour format (AM/PM) to 24-hour format for MySQL
    const start24 = to24Hour(working_hours_start);
    const end24 = to24Hour(working_hours_end);

    const pool = getPool();
    await pool.query(
      'UPDATE delivery_volunteers SET full_name = ?, phone = ?, age = ?, gender = ?, vehicle_type = ?, vehicle_number = ?, government_id = ?, address = ?, working_hours_start = ?, working_hours_end = ?, emergency_contact = ? WHERE volunteer_id = ?',
      [name.trim(), phone.trim(), parsedAge, gender, vehicle_type, vehicle_number.trim(), government_id || null, address.trim(), start24, end24, emergency_contact.trim(), req.user.id]
    );

    res.json({ success: true, message: 'Profile updated successfully.' });
  } catch (err) {
    console.error('Update volunteer profile error:', err);
    res.status(500).json({ success: false, message: 'Failed to update volunteer profile.' });
  }
});

module.exports = router;
