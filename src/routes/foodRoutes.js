const express = require('express');
const path = require('path');
const multer = require('multer');
const { getPool } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// Multer setup for food image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../public/uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `food_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed.'));
    }
  },
});

// ─── GET ALL AVAILABLE FOOD LISTINGS (public) ──────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT fl.*, r.name AS restaurant_name, r.address AS restaurant_address, r.phone AS restaurant_phone
       FROM food_listings fl
       JOIN restaurants r ON fl.restaurant_id = r.restaurant_id
       WHERE fl.status = 'available' AND fl.expiry_time > NOW()
       ORDER BY fl.created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Get food listings error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch food listings.' });
  }
});

// ─── GET RESTAURANT'S OWN LISTINGS ────────────────────────────────────────────
router.get('/my', authMiddleware, requireRole('restaurant'), async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT fl.*,
        (SELECT COUNT(*) FROM food_requests fr WHERE fr.food_id = fl.food_id AND fr.request_status = 'pending') AS pending_requests
       FROM food_listings fl
       WHERE fl.restaurant_id = ?
       ORDER BY fl.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Get my listings error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch your listings.' });
  }
});

// ─── POST NEW FOOD LISTING ─────────────────────────────────────────────────────
router.post('/', authMiddleware, requireRole('restaurant'), upload.single('image'), async (req, res) => {
  try {
    const { food_name, quantity, description, expiry_time, actual_expiry_time, original_price, selling_price } = req.body;

    if (!food_name || !quantity || !expiry_time) {
      return res.status(400).json({ success: false, message: 'food_name, quantity, and expiry_time are required.' });
    }

    // Validate pricing
    const origPrice = original_price ? parseFloat(original_price) : null;
    const sellPrice = selling_price ? parseFloat(selling_price) : null;

    if (origPrice !== null && origPrice < 0) {
      return res.status(400).json({ success: false, message: 'Original price cannot be negative.' });
    }
    if (sellPrice !== null) {
      if (sellPrice < 0) {
        return res.status(400).json({ success: false, message: 'Selling price cannot be negative.' });
      }
      if (origPrice !== null && sellPrice > origPrice * 0.5) {
        return res.status(400).json({ success: false, message: `Selling price cannot exceed 50% of the original price (max ₹${(origPrice * 0.5).toFixed(2)}).` });
      }
    }

    const image_url = req.file ? `/uploads/${req.file.filename}` : null;
    const pool = getPool();

    const [result] = await pool.query(
      'INSERT INTO food_listings (restaurant_id, food_name, quantity, description, actual_expiry_time, expiry_time, image_url, original_price, selling_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, food_name.trim(), quantity.trim(), description?.trim() || null, actual_expiry_time || null, expiry_time, image_url, origPrice, sellPrice]
    );

    const [newListing] = await pool.query(`
       SELECT fl.*, r.name AS restaurant_name, r.address AS restaurant_address, r.phone AS restaurant_phone
       FROM food_listings fl
       JOIN restaurants r ON fl.restaurant_id = r.restaurant_id
       WHERE fl.food_id = ?`,
       [result.insertId]
    );
    
    // Broadcast real-time update to all connected clients
    if (req.app.get('io') && newListing[0]) {
      req.app.get('io').emit('new_food_listing', newListing[0]);
    }

    res.status(201).json({ success: true, message: 'Food listing created.', data: newListing[0] });
  } catch (err) {
    console.error('Create food listing error:', err);
    res.status(500).json({ success: false, message: 'Failed to create food listing.' });
  }
});

// ─── UPDATE FOOD LISTING STATUS ────────────────────────────────────────────────
router.patch('/:id/status', authMiddleware, requireRole('restaurant'), async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['available', 'requested', 'accepted', 'volunteer_assigned', 'delivered'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value.' });
    }

    const pool = getPool();
    const [check] = await pool.query(
      'SELECT food_id FROM food_listings WHERE food_id = ? AND restaurant_id = ?',
      [req.params.id, req.user.id]
    );
    if (check.length === 0) {
      return res.status(404).json({ success: false, message: 'Listing not found or not yours.' });
    }

    await pool.query('UPDATE food_listings SET status = ? WHERE food_id = ?', [status, req.params.id]);
    res.json({ success: true, message: 'Listing status updated.' });
  } catch (err) {
    console.error('Update listing status error:', err);
    res.status(500).json({ success: false, message: 'Failed to update listing status.' });
  }
});

// ─── DELETE FOOD LISTING ───────────────────────────────────────────────────────
router.delete('/:id', authMiddleware, requireRole('restaurant'), async (req, res) => {
  try {
    const pool = getPool();
    const [check] = await pool.query(
      'SELECT food_id FROM food_listings WHERE food_id = ? AND restaurant_id = ?',
      [req.params.id, req.user.id]
    );
    if (check.length === 0) {
      return res.status(404).json({ success: false, message: 'Listing not found or not yours.' });
    }

    await pool.query('DELETE FROM food_listings WHERE food_id = ?', [req.params.id]);
    res.json({ success: true, message: 'Food listing deleted.' });
  } catch (err) {
    console.error('Delete food listing error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete listing.' });
  }
});

module.exports = router;
