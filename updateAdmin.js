const { initializeDatabase, getPool } = require('./src/db.js');
const bcrypt = require('bcryptjs');

async function updateAdmin() {
  await initializeDatabase();
  const pool = getPool();
  
  // Hash the new password
  const adminHash = await bcrypt.hash('Skn090118@', 12);
  
  // Clear existing admins
  await pool.query('DELETE FROM admins');
  
  // Insert the requested admin
  await pool.query(
    'INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)',
    ['System Administrator', 'foodbridgynsk@gmail.com', adminHash]
  );
  
  console.log('Successfully updated admin credentials.');
  process.exit(0);
}

updateAdmin().catch(console.error);
