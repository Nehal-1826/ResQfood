const express = require('express');
const { getPool } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// ─── NGO: Confirm pickup ───────────────────────────────────────────────────────
router.post('/', authMiddleware, requireRole('organization'), async (req, res) => {
  try {
    const { request_id } = req.body;
    if (!request_id) {
      return res.status(400).json({ success: false, message: 'request_id is required.' });
    }

    const pool = getPool();

    // Verify request belongs to this NGO and is Accepted
    const [check] = await pool.query(
      "SELECT fr.*, fl.food_id FROM food_requests fr JOIN food_listings fl ON fr.food_id = fl.food_id WHERE fr.request_id = ? AND fr.organization_id = ? AND fr.request_status = 'Accepted'",
      [request_id, req.user.id]
    );
    if (check.length === 0) {
      return res.status(404).json({ success: false, message: 'Accepted request not found.' });
    }

    // Check not already confirmed
    const [existing] = await pool.query('SELECT pickup_id FROM pickup_confirmations WHERE request_id = ?', [request_id]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Pickup already confirmed.' });
    }

    // Insert confirmation
    const [result] = await pool.query(
      "INSERT INTO pickup_confirmations (request_id, confirmation_status) VALUES (?, 'Confirmed')",
      [request_id]
    );

    // Update request and listing status
    await pool.query("UPDATE food_requests SET request_status = 'Completed' WHERE request_id = ?", [request_id]);
    await pool.query("UPDATE food_listings SET status = 'collected' WHERE food_id = ?", [check[0].food_id]);

    res.status(201).json({ success: true, message: 'Pickup confirmed successfully!', pickup_id: result.insertId });
  } catch (err) {
    console.error('Confirm pickup error:', err);
    res.status(500).json({ success: false, message: 'Failed to confirm pickup.' });
  }
});

// ─── Get pickup details for a request ─────────────────────────────────────────
router.get('/:requestId', authMiddleware, async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT pc.*, fr.request_status, fr.organization_id, fl.food_name, fl.quantity, r.name AS restaurant_name
       FROM pickup_confirmations pc
       JOIN food_requests fr ON pc.request_id = fr.request_id
       JOIN food_listings fl ON fr.food_id = fl.food_id
       JOIN restaurants r ON fl.restaurant_id = r.restaurant_id
       WHERE pc.request_id = ?`,
      [req.params.requestId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Pickup confirmation not found.' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Get pickup error:', err);
    res.status(500).json({ success: false, message: 'Failed to get pickup confirmation.' });
  }
});

// ─── Restaurant: stats ─────────────────────────────────────────────────────────
router.get('/stats/restaurant', authMiddleware, requireRole('restaurant'), async (req, res) => {
  try {
    const pool = getPool();
    const [active] = await pool.query(
      "SELECT COUNT(*) AS count FROM food_listings WHERE restaurant_id = ? AND status = 'available'",
      [req.user.id]
    );
    const [pending] = await pool.query(
      "SELECT COUNT(*) AS count FROM food_requests fr JOIN food_listings fl ON fr.food_id = fl.food_id WHERE fl.restaurant_id = ? AND fr.request_status = 'Pending'",
      [req.user.id]
    );
    const [completed] = await pool.query(
      "SELECT COUNT(*) AS count FROM food_requests fr JOIN food_listings fl ON fr.food_id = fl.food_id WHERE fl.restaurant_id = ? AND fr.request_status = 'Completed'",
      [req.user.id]
    );
    res.json({
      success: true,
      data: {
        active_listings: active[0].count,
        pending_requests: pending[0].count,
        completed_donations: completed[0].count,
      },
    });
  } catch (err) {
    console.error('Restaurant stats error:', err);
    res.status(500).json({ success: false, message: 'Failed to get stats.' });
  }
});

// ─── NGO: stats ────────────────────────────────────────────────────────────────
router.get('/stats/organization', authMiddleware, requireRole('organization'), async (req, res) => {
  try {
    const pool = getPool();
    const [total] = await pool.query(
      'SELECT COUNT(*) AS count FROM food_requests WHERE organization_id = ?',
      [req.user.id]
    );
    const [accepted] = await pool.query(
      "SELECT COUNT(*) AS count FROM food_requests WHERE organization_id = ? AND request_status IN ('Accepted', 'Completed')",
      [req.user.id]
    );
    const [completed] = await pool.query(
      "SELECT COUNT(*) AS count FROM food_requests WHERE organization_id = ? AND request_status = 'Completed'",
      [req.user.id]
    );
    res.json({
      success: true,
      data: {
        total_requests: total[0].count,
        accepted_requests: accepted[0].count,
        completed_pickups: completed[0].count,
      },
    });
  } catch (err) {
    console.error('Org stats error:', err);
    res.status(500).json({ success: false, message: 'Failed to get stats.' });
  }
});

module.exports = router;
