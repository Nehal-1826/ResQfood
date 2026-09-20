const { initializeDatabase } = require('./src/db');
const fs = require('fs');

async function checkUsers() {
  const pool = await initializeDatabase();
  const [rests] = await pool.query('SELECT email FROM restaurants LIMIT 1');
  const [orgs] = await pool.query('SELECT email FROM organizations LIMIT 1');
  const [vols] = await pool.query('SELECT email FROM delivery_volunteers LIMIT 1');
  
  fs.writeFileSync('tmp_users.json', JSON.stringify({
    restaurant: rests[0]?.email,
    organization: orgs[0]?.email,
    volunteer: vols[0]?.email
  }, null, 2));
  
  process.exit(0);
}
checkUsers();
