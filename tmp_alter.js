const { initializeDatabase, getPool } = require('./src/db.js');

async function run() {
  await initializeDatabase();
  const pool = getPool();
  try {
    await pool.query("ALTER TABLE password_resets MODIFY COLUMN user_type ENUM('restaurant', 'organization', 'administrator', 'volunteer') NOT NULL");
    console.log("Successfully altered password_resets table to support volunteer role.");
  } catch(e) {
    console.error("Error altering table", e);
  }
  process.exit(0);
}

run();
