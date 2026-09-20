const { initializeDatabase } = require('./src/db');
const bcrypt = require('bcryptjs');

async function setupDemoRestaurant() {
  try {
    const pool = await initializeDatabase();
    const password_hash = await bcrypt.hash('Password@123', 12);

    await pool.query(
      `INSERT INTO restaurants (name, email, phone, address, password_hash, email_verified)
       VALUES ('Demo Restaurant', 'restaurant@demo.com', '9876543210', '123 Food Street, City', ?, 1)
       ON DUPLICATE KEY UPDATE password_hash = ?, email_verified = 1`,
      [password_hash, password_hash]
    );

    await pool.query(
      `UPDATE restaurants SET password_hash = ?, email_verified = 1 WHERE email = 'nehalkannan06@gmail.com'`,
      [password_hash]
    );

    console.log('✅ Demo restaurant accounts ready.');
    process.exit(0);
  } catch (err) {
    console.error('Error setting up demo restaurant:', err);
    process.exit(1);
  }
}

setupDemoRestaurant();
