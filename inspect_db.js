const { initializeDB, getPool } = require('./src/db');

async function inspectDB() {
  try {
    await initializeDB();
    const pool = getPool();
    
    console.log('--- Delivery Tracking ---');
    const [deliveries] = await pool.query('SELECT * FROM delivery_tracking');
    console.log(JSON.stringify(deliveries, null, 2));
    
    console.log('\n--- Delivery Volunteers ---');
    const [volunteers] = await pool.query('SELECT volunteer_id, full_name FROM delivery_volunteers');
    console.log(JSON.stringify(volunteers, null, 2));
    
    process.exit(0);
  } catch (err) {
    console.error('Error inspecting DB:', err);
    process.exit(1);
  }
}

inspectDB();
