const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixSchemaInconsistency() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'foodbridge_db'
  });

  try {
    console.log('--- Consolidating Volunteer Tables ---');
    
    // 1. Drop the faulty constraint in delivery_tracking
    console.log('⏳ Dropping faulty FK constraint in delivery_tracking...');
    try {
      await connection.query('ALTER TABLE delivery_tracking DROP FOREIGN KEY delivery_tracking_ibfk_4');
    } catch (e) {
      console.log('ℹ️ delivery_tracking_ibfk_4 might not exist or already dropped:', e.message);
    }

    // 2. Add the correct constraint referencing delivery_volunteers
    console.log('⏳ Adding correct FK constraint to delivery_tracking...');
    try {
      await connection.query('ALTER TABLE delivery_tracking ADD CONSTRAINT delivery_tracking_ibfk_4 FOREIGN KEY (volunteer_id) REFERENCES delivery_volunteers(volunteer_id) ON DELETE SET NULL');
    } catch (e) {
      console.log('⚠️ Failed to add correct FK constraint:', e.message);
    }

    // 3. Ensure delivery_assignments has UNIQUE constraint on request_id
    console.log('⏳ Ensuring unique constraint on delivery_assignments(request_id)...');
    try {
      await connection.query('ALTER TABLE delivery_assignments ADD CONSTRAINT UNIQUE (request_id)');
    } catch (e) {
      console.log('ℹ️ UNIQUE(request_id) already exists or failed:', e.message);
    }

    console.log('✅ Schema Consolidated Successfully!');
  } catch (err) {
    console.error('❌ Schema Fix Failed:', err);
  } finally {
    await connection.end();
  }
}

fixSchemaInconsistency();
