const express = require('express');
const router = express.Router();
const { getPool } = require('../db');

// Note: Volunteer Login / Register is now handled in authRoutes.js

// Start a delivery (Assumed to securely handle volunteer acceptance of a request)
router.post('/start', async (req, res) => {
  const { request_id, volunteer_id } = req.body;
  
  if (!request_id || !volunteer_id) {
    return res.status(400).json({ success: false, message: 'Missing required fields.' });
  }
  
  let connection;
  try {
    const pool = getPool();
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Lock the request for update and check its status
    const [requestRows] = await connection.query(
      `SELECT r.food_id, r.organization_id, f.restaurant_id, r.request_status
       FROM food_requests r JOIN food_listings f ON r.food_id = f.food_id 
       WHERE r.request_id = ? FOR UPDATE`,
      [request_id]
    );
    
    if (requestRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Food request not found.' });
    }

    const { restaurant_id, organization_id, request_status } = requestRows[0];

    // 2. Check if already assigned or delivered
    if (request_status !== 'accepted' && request_status !== 'pending') {
       // Check if it's already assigned to THIS volunteer (graceful re-entry)
       const [currentAssign] = await connection.query(
         `SELECT volunteer_id FROM delivery_assignments WHERE request_id = ? AND volunteer_id = ?`,
         [request_id, volunteer_id]
       );
       if (currentAssign.length === 0) {
         await connection.rollback();
         return res.status(409).json({ success: false, message: 'This request is no longer available for acceptance.' });
       }
    }
    
    // 3. Create or update assignment (atomically)
    try {
      await connection.query(
        `INSERT INTO delivery_assignments (request_id, volunteer_id, assignment_status) 
         VALUES (?, ?, 'assigned')
         ON DUPLICATE KEY UPDATE volunteer_id = VALUES(volunteer_id), assignment_status = 'assigned'`,
        [request_id, volunteer_id]
      );
    } catch (assignErr) {
       console.error('Assignment insertion error:', assignErr);
       await connection.rollback();
       return res.status(500).json({ success: false, message: 'Failed to assign delivery.' });
    }

    // 4. Update or Insert tracking
    const [existingDelivery] = await connection.query(
      `SELECT delivery_id FROM delivery_tracking WHERE request_id = ? FOR UPDATE`,
      [request_id]
    );
    
    let delivery_id;
    if (existingDelivery.length > 0) {
      delivery_id = existingDelivery[0].delivery_id;
      await connection.query(
        `UPDATE delivery_tracking SET volunteer_id = ?, delivery_status = 'volunteer_assigned' WHERE delivery_id = ?`,
        [volunteer_id, delivery_id]
      );
    } else {
      const [insertResult] = await connection.query(
        `INSERT INTO delivery_tracking (request_id, restaurant_id, organization_id, volunteer_id, delivery_status)
         VALUES (?, ?, ?, ?, 'volunteer_assigned')`,
        [request_id, restaurant_id, organization_id, volunteer_id]
      );
      delivery_id = insertResult.insertId;
    }

    // 5. Update statuses
    await connection.query('UPDATE food_requests SET request_status = "volunteer_assigned" WHERE request_id = ?', [request_id]);
    await connection.query(
      `UPDATE food_listings fl
       JOIN food_requests fr ON fl.food_id = fr.food_id
       SET fl.status = "volunteer_assigned"
       WHERE fr.request_id = ?`,
      [request_id]
    );
    
    await connection.commit();

    // Socket updates (outside transaction)
    const io = req.app.get('io');
    if (io) {
      io.to(`delivery_${delivery_id}`).emit('status_update', { delivery_id, status: 'volunteer_assigned' });
      io.emit('delivery_status_update', { request_id });
    }
    
    res.json({ success: true, delivery_id });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Error starting delivery:', error);
    res.status(500).json({ success: false, message: 'Internal server error occurred while accepting delivery.' });
  } finally {
    if (connection) connection.release();
  }
});

// Update Volunteer Location
router.post('/update-location', async (req, res) => {
  const { delivery_id, volunteer_id, latitude, longitude } = req.body;
  if (!delivery_id || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ success: false, message: 'Missing fields.' });
  }

  try {
    const pool = getPool();
    await pool.query(
      `UPDATE delivery_tracking SET current_latitude = ?, current_longitude = ? WHERE delivery_id = ?`,
      [latitude, longitude, delivery_id]
    );

    if (volunteer_id) {
      // Also persist to live locations table
      await pool.query(
        `INSERT INTO volunteer_live_locations (volunteer_id, latitude, longitude) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE latitude = VALUES(latitude), longitude = VALUES(longitude), updated_at = CURRENT_TIMESTAMP`,
        [volunteer_id, latitude, longitude]
      );
    }
    
    const io = req.app.get('io');
    io.to(`delivery_${delivery_id}`).emit('location_update', { delivery_id, latitude, longitude });

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Update delivery status
router.post('/update-status', async (req, res) => {
  const { delivery_id, status: rawStatus } = req.body;
  
  if (!delivery_id || !rawStatus) {
    return res.status(400).json({ success: false, message: 'Missing fields.' });
  }

  // Normalize status: Convert from user-friendly strings to database ENUM keys
  let status = rawStatus.toLowerCase().trim().replace(/ /g, '_');
  
  // Map common variations
  const statusMap = {
    'food_picked_up': 'picked_up',
    'arrived_at_restaurant': 'picked_up',
    'on_the_way_to_delivery': 'on_the_way',
    'food_is_delivered': 'delivered'
  };
  
  if (statusMap[status]) status = statusMap[status];
  
  const validStatuses = [
    'available', 'accepted', 'volunteer_assigned', 
    'picked_up', 'on_the_way', 'delivered', 'rejected'
  ];
  
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status provided.' });
  }

  try {
    const pool = getPool();
    
    // Get the request_id associated with this delivery
    const [deliveryRows] = await pool.query('SELECT request_id FROM delivery_tracking WHERE delivery_id = ?', [delivery_id]);
    if (deliveryRows.length === 0) return res.status(404).json({ success: false, message: 'Delivery not found.' });
    const { request_id } = deliveryRows[0];

    // Update tracking
    await pool.query('UPDATE delivery_tracking SET delivery_status = ? WHERE delivery_id = ?', [status, delivery_id]);
    
    // Update related tables
    await pool.query('UPDATE food_requests SET request_status = ? WHERE request_id = ?', [status, request_id]);
    await pool.query(
      `UPDATE food_listings fl
       JOIN food_requests fr ON fl.food_id = fr.food_id
       SET fl.status = ?
       WHERE fr.request_id = ?`,
      [status, request_id]
    );

    const io = req.app.get('io');
    if (io) {
      io.to(`delivery_${delivery_id}`).emit('status_update', { delivery_id, status });
      io.emit('delivery_status_update', { delivery_id, status });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get Delivery Tracking Data
router.get('/:id', async (req, res) => {
  const idValue = req.params.id;
  const isRequest = req.query.type === 'request';
  
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT d.*, 
              r.name as restaurant_name, r.address as restaurant_address, r.phone as restaurant_phone,
              o.name as ngo_name, o.address as ngo_address, o.phone as ngo_phone,
              v.full_name as volunteer_name, v.phone as volunteer_phone, v.vehicle_type, v.vehicle_number, v.profile_photo_path,
              f.food_name, f.quantity
       FROM delivery_tracking d
       LEFT JOIN restaurants r ON d.restaurant_id = r.restaurant_id
       LEFT JOIN organizations o ON d.organization_id = o.organization_id
       LEFT JOIN delivery_volunteers v ON d.volunteer_id = v.volunteer_id
       LEFT JOIN food_requests fr ON d.request_id = fr.request_id
       LEFT JOIN food_listings f ON fr.food_id = f.food_id
       WHERE ${isRequest ? 'd.request_id' : 'd.delivery_id'} = ?`,
      [idValue]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Delivery not found.' });
    }
    
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error fetching delivery:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get available requests for volunteers
router.get('/volunteer/available', async (req, res) => {
  try {
    const pool = getPool();
    // Fetch requests that are Accepted AND 
    // eithier have NO assignment, OR the latest assignment is OLDER than 5 minutes and not delivered
    const [rows] = await pool.query(`
      SELECT fr.request_id, f.food_name, f.quantity, f.expiry_time, r.name as restaurant_name, r.address as restaurant_address,
             o.name as ngo_name, o.address as ngo_address,
             (SELECT assignment_id FROM delivery_assignments da WHERE da.request_id = fr.request_id ORDER BY accepted_time DESC LIMIT 1) as latest_assignment,
             (SELECT accepted_time FROM delivery_assignments da WHERE da.request_id = fr.request_id ORDER BY accepted_time DESC LIMIT 1) as latest_accepted_time,
             (SELECT assignment_status FROM delivery_assignments da WHERE da.request_id = fr.request_id ORDER BY accepted_time DESC LIMIT 1) as latest_status
      FROM food_requests fr
      JOIN food_listings f ON fr.food_id = f.food_id
      JOIN restaurants r ON f.restaurant_id = r.restaurant_id
      JOIN organizations o ON fr.organization_id = o.organization_id
      WHERE fr.request_status = 'accepted' 
    `);
    
    // Filter rows based on the 5 minute logic
    const availableRows = rows.filter(row => {
       if (!row.latest_assignment) return true; // Never assigned
       if (row.latest_status === 'delivered' || row.latest_status === 'picked_up' || row.latest_status === 'on_the_way') return false; // Already active or done
       
       const timeDiffMins = (new Date() - new Date(row.latest_accepted_time)) / (1000 * 60);
       return timeDiffMins >= 5; // Expired assignment
    });

    res.json({ success: true, data: availableRows.map(row => ({
       request_id: row.request_id,
       food_name: row.food_name,
       quantity: row.quantity,
       expiry_time: row.expiry_time,
       restaurant_name: row.restaurant_name,
       restaurant_address: row.restaurant_address,
       ngo_name: row.ngo_name,
       ngo_address: row.ngo_address
    }))});
  } catch (error) {
    console.error('Error fetching available requests:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get volunteer's own deliveries
router.get('/volunteer/my-deliveries', async (req, res) => {
  const volunteer_id = req.query.volunteer_id;
  if (!volunteer_id) return res.status(400).json({ success: false, message: 'volunteer_id is required.' });

  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT d.*, 
              r.name as restaurant_name, r.address as restaurant_address,
              o.name as ngo_name, o.address as ngo_address,
              f.food_name, f.quantity
       FROM delivery_tracking d
       LEFT JOIN restaurants r ON d.restaurant_id = r.restaurant_id
       LEFT JOIN organizations o ON d.organization_id = o.organization_id
       LEFT JOIN food_requests fr ON d.request_id = fr.request_id
       LEFT JOIN food_listings f ON fr.food_id = f.food_id
       WHERE d.volunteer_id = ?
       ORDER BY d.last_updated_timestamp DESC`,
      [volunteer_id]
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching volunteer deliveries:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get volunteer stats
router.get('/volunteer/stats', async (req, res) => {
  const volunteer_id = req.query.volunteer_id;
  if (!volunteer_id) return res.status(400).json({ success: false, message: 'volunteer_id is required.' });

  try {
    const pool = getPool();
    const [stats] = await pool.query(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN delivery_status = 'delivered' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN delivery_status NOT IN ('delivered', 'rejected') THEN 1 ELSE 0 END) as active
       FROM delivery_tracking 
       WHERE volunteer_id = ?`,
      [volunteer_id]
    );
    res.json({ success: true, data: stats[0] });
  } catch (error) {
    console.error('Error fetching volunteer stats:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Alias endpoints as requested in requirements
router.get('/volunteer/tasks', (req, res, next) => {
  req.url = '/volunteer/available';
  next();
}, router);

router.post('/volunteer/accept-task', (req, res, next) => {
  req.url = '/start';
  next();
}, router);

router.post('/tracking/update-location', (req, res, next) => {
  req.url = '/update-location';
  next();
}, router);

module.exports = router;
