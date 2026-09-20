const express = require('express');
const { getPool } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// Apply middleware to all routes in this file
router.use(authMiddleware);
router.use(requireRole('administrator')); // Only admins can access these endpoints

// ─── GET ALL REGISTERED USERS ────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const pool = getPool();
    
    // Fetch all restaurants
    const [restaurants] = await pool.query(`
      SELECT restaurant_id as id, name, email, phone, address, email_verified, created_at, 'restaurant' as role 
      FROM restaurants 
      ORDER BY created_at DESC
    `);

    // Fetch all organizations
    const [organizations] = await pool.query(`
      SELECT organization_id as id, name, email, phone, address, email_verified, created_at, 'organization' as role 
      FROM organizations 
      ORDER BY created_at DESC
    `);

    // Fetch all volunteers
    const [volunteers] = await pool.query(`
      SELECT volunteer_id as id, full_name as name, email, phone, address, email_verified, created_at, 'volunteer' as role 
      FROM delivery_volunteers 
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      data: {
        restaurants,
        organizations,
        volunteers
      }
    });
  } catch (err) {
    console.error('Admin get users error:', err);
    res.status(500).json({ success: false, message: 'Server error retrieving users.' });
  }
});

// ─── DELETE USER ACCOUNT ─────────────────────────────────────────────────────
router.delete('/users/:role/:id', async (req, res) => {
  try {
    const { role, id } = req.params;
    const pool = getPool();

    let tableName = '';
    if (role === 'restaurant') tableName = 'restaurants';
    else if (role === 'organization') tableName = 'organizations';
    else if (role === 'volunteer') tableName = 'delivery_volunteers';
    else return res.status(400).json({ success: false, message: 'Invalid role for deletion.' });

    const idColumn = role === 'restaurant' ? 'restaurant_id' : (role === 'organization' ? 'organization_id' : 'volunteer_id');

    const [result] = await pool.query(`DELETE FROM ${tableName} WHERE ${idColumn} = ?`, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.json({ success: true, message: 'Account successfully removed.' });
  } catch (err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({ success: false, message: 'Server error while deleting account.' });
  }
});

module.exports = router;
