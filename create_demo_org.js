const { initializeDatabase } = require('./src/db');
const bcrypt = require('bcryptjs');

async function setupDemoOrg() {
  try {
    const pool = await initializeDatabase();
    const password_hash = await bcrypt.hash('Password@123', 12);

    await pool.query(
      `INSERT INTO organizations (name, email, phone, address, password_hash, org_type, sector, people_count, email_verified)
       VALUES ('Hope Care Foundation', 'org@demo.com', '9876543211', '456 Charity Road, City', ?, 'Orphanage', 'Private', 50, 1)
       ON DUPLICATE KEY UPDATE password_hash = ?, email_verified = 1`,
      [password_hash, password_hash]
    );

    await pool.query(
      `UPDATE organizations SET password_hash = ?, email_verified = 1 WHERE email = 'guruprasathg23@gmail.com'`,
      [password_hash]
    );

    console.log('✅ Demo organization accounts ready.');
    process.exit(0);
  } catch (err) {
    console.error('Error setting up demo organization:', err);
    process.exit(1);
  }
}

setupDemoOrg();
