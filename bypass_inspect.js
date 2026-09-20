const mysql = require('mysql2/promise');
require('dotenv').config();

async function bypassInspect() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'foodbridge_db'
    });
    
    console.log('--- Delivery Tracking Data ---');
    const [deliveries] = await connection.query('SELECT * FROM delivery_tracking');
    console.log(JSON.stringify(deliveries, null, 2));
    
    console.log('\n--- Checking Table Status/Schema ---');
    const [schema] = await connection.query('SHOW CREATE TABLE delivery_tracking');
    console.log(schema[0]['Create Table']);

    await connection.end();
  } catch (err) {
    console.error('Error during bypass inspection:', err);
  }
}

bypassInspect();
