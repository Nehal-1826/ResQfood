require('dotenv').config();
const { getPool, initializeDatabase } = require('./src/db');
const fs = require('fs');

async function test() {
  await initializeDatabase();
  const pool = getPool();
  try {
    const [rows] = await pool.query("SELECT food_id, food_name, expiry_time, NOW() as curr, status FROM food_listings ORDER BY food_id DESC LIMIT 5");
    fs.writeFileSync('db_out.json', JSON.stringify({ rows }, null, 2));
  } catch(e) { console.error(e); }
  process.exit(0);
}

test();
