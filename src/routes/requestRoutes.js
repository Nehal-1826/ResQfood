const express = require('express');
const { getPool } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// ─── NGO: Send a pickup request ────────────────────────────────────────────────
router.post('/', authMiddleware, requireRole('organization'), async (req, res) => {
  try {
    const { food_id } = req.body;
    if (!food_id) {
      return res.status(400).json({ success: false, message: 'food_id is required.' });
    }

    const pool = getPool();

    // Check food listing exists and is available
    const [food] = await pool.query(
      "SELECT * FROM food_listings WHERE food_id = ? AND status = 'available' AND expiry_time > NOW()",
      [food_id]
    );
    if (food.length === 0) {
      return res.status(404).json({ success: false, message: 'Food listing not available or has expired.' });
    }

    // Check NGO hasn't already requested this food
    const [existing] = await pool.query(
      "SELECT request_id FROM food_requests WHERE food_id = ? AND organization_id = ? AND request_status NOT IN ('rejected')",
      [food_id, req.user.id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'You have already sent a request for this food.' });
    }

    const [result] = await pool.query(
      'INSERT INTO food_requests (food_id, organization_id) VALUES (?, ?)',
      [food_id, req.user.id]
    );

    // Mark listing as requested
    await pool.query("UPDATE food_listings SET status = 'requested' WHERE food_id = ?", [food_id]);

    if (req.app.get('io')) {
      req.app.get('io').emit('new_food_request');
    }

    res.status(201).json({ success: true, message: 'Pickup request sent successfully.', request_id: result.insertId });
  } catch (err) {
    console.error('Create request error:', err);
    res.status(500).json({ success: false, message: 'Failed to create pickup request.' });
  }
});

// ─── NGO: Get own requests ─────────────────────────────────────────────────────
router.get('/my', authMiddleware, requireRole('organization'), async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT fr.*, fl.food_name, fl.quantity, fl.description, fl.expiry_time, fl.image_url, fl.status AS listing_status,
              r.name AS restaurant_name, r.phone AS restaurant_phone, r.address AS restaurant_address,
              dt.delivery_status, v.full_name AS volunteer_name, v.phone AS volunteer_phone, v.vehicle_type, v.vehicle_number, v.profile_photo_path
       FROM food_requests fr
       JOIN food_listings fl ON fr.food_id = fl.food_id
       JOIN restaurants r ON fl.restaurant_id = r.restaurant_id
       LEFT JOIN delivery_tracking dt ON fr.request_id = dt.request_id
       LEFT JOIN delivery_volunteers v ON dt.volunteer_id = v.volunteer_id
       WHERE fr.organization_id = ?
       ORDER BY fr.request_time DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Get my requests error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch your requests.' });
  }
});

// ─── RESTAURANT: Get incoming requests ────────────────────────────────────────
router.get('/incoming', authMiddleware, requireRole('restaurant'), async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT fr.*, fl.food_name, fl.quantity, fl.expiry_time, fl.image_url,
              o.name AS organization_name, o.phone AS organization_phone, o.email AS organization_email,
              dt.delivery_status, v.full_name AS volunteer_name, v.phone AS volunteer_phone, v.vehicle_type, v.vehicle_number, v.profile_photo_path
       FROM food_requests fr
       JOIN food_listings fl ON fr.food_id = fl.food_id
       JOIN organizations o ON fr.organization_id = o.organization_id
       LEFT JOIN delivery_tracking dt ON fr.request_id = dt.request_id
       LEFT JOIN delivery_volunteers v ON dt.volunteer_id = v.volunteer_id
       WHERE fl.restaurant_id = ?
       ORDER BY fr.request_time DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Get incoming requests error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch incoming requests.' });
  }
});

// ─── RESTAURANT: Accept or Reject a request ───────────────────────────────────
router.patch('/:id/status', authMiddleware, requireRole('restaurant'), async (req, res) => {
  try {
    const { status } = req.body;
    const normalizedStatus = status.toLowerCase();
    if (!['accepted', 'rejected'].includes(normalizedStatus)) {
      return res.status(400).json({ success: false, message: 'Status must be accepted or rejected.' });
    }

    const pool = getPool();

    // Verify the request belongs to this restaurant's food
    const [check] = await pool.query(
      `SELECT fr.request_id, fr.food_id FROM food_requests fr
       JOIN food_listings fl ON fr.food_id = fl.food_id
       WHERE fr.request_id = ? AND fl.restaurant_id = ?`,
      [req.params.id, req.user.id]
    );
    if (check.length === 0) {
      return res.status(404).json({ success: false, message: 'Request not found or not associated with your restaurant.' });
    }

    await pool.query('UPDATE food_requests SET request_status = ? WHERE request_id = ?', [normalizedStatus, req.params.id]);

    // If accepted, update food listing and create delivery task
    if (normalizedStatus === 'accepted') {
      await pool.query("UPDATE food_listings SET status = 'accepted' WHERE food_id = ?", [check[0].food_id]);
      
      // Fetch details for tracking
      const [reqDetails] = await pool.query(
        `SELECT fl.restaurant_id, fr.organization_id 
         FROM food_requests fr JOIN food_listings fl ON fr.food_id = fl.food_id 
         WHERE fr.request_id = ?`,
        [req.params.id]
      );

      if (reqDetails.length > 0) {
        // Create initial tracking record
        await pool.query(
          `INSERT INTO delivery_tracking (request_id, restaurant_id, organization_id, delivery_status) 
           VALUES (?, ?, ?, 'available')`,
          [req.params.id, reqDetails[0].restaurant_id, reqDetails[0].organization_id]
        );
      }
    } else if (normalizedStatus === 'rejected') {
      await pool.query("UPDATE food_listings SET status = 'available' WHERE food_id = ?", [check[0].food_id]);
    }

    if (req.app.get('io')) {
      req.app.get('io').emit('request_status_update');
      if (normalizedStatus === 'accepted') {
        req.app.get('io').emit('new_delivery_available');
      }
    }

    res.json({ success: true, message: `Request ${normalizedStatus} successfully.` });
  } catch (err) {
    console.error('Update request status error:', err);
    res.status(500).json({ success: false, message: 'Failed to update request status.' });
  }
});

module.exports = router;
