const mysql = require('mysql2/promise');
require('dotenv').config();

async function runMigrateManual() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'foodbridge_db'
  });

  try {
    console.log('--- Starting Manual Migration ---');
    
    // Disable FK checks to allow ENUM modification if needed
    console.log('⏳ Disabling Foreign Key Checks...');
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    console.log('⏳ Updating food_listings status...');
    await connection.query("ALTER TABLE food_listings MODIFY COLUMN status ENUM('available', 'requested', 'accepted', 'volunteer_assigned', 'picked_up', 'on_the_way', 'delivered') DEFAULT 'available'");

    console.log('⏳ Updating food_requests request_status...');
    await connection.query("ALTER TABLE food_requests MODIFY COLUMN request_status ENUM('pending', 'accepted', 'volunteer_assigned', 'picked_up', 'on_the_way', 'delivered', 'rejected') DEFAULT 'pending'");

    console.log('⏳ Updating delivery_tracking delivery_status...');
    await connection.query("ALTER TABLE delivery_tracking MODIFY COLUMN delivery_status ENUM('available', 'accepted', 'volunteer_assigned', 'picked_up', 'on_the_way', 'delivered', 'rejected') DEFAULT 'available'");

    console.log('⏳ Adding unique constraint to delivery_assignments...');
    try {
      await connection.query("ALTER TABLE delivery_assignments ADD CONSTRAINT UNIQUE (request_id)");
    } catch (e) {
      console.log('ℹ️ delivery_assignments UNIQUE constraint might already exist:', e.message);
    }

    console.log('⏳ Enabling Foreign Key Checks...');
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('✅ Manual Migration Successful!');
  } catch (err) {
    console.error('❌ Manual Migration Failed:', err);
  } finally {
    await connection.end();
  }
}

runMigrateManual();
