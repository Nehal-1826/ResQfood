require('dotenv').config();
const emailService = require('./services/emailService');
const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD ?? '',
  multipleStatements: true,
};

let pool;

async function initializeDatabase() {
  // First connect without specifying a database to create it if needed
  const tempConn = await mysql.createConnection(dbConfig);

  await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'foodbridge_db'}\``);
  await tempConn.end();

  // Now connect to the actual database
  pool = mysql.createPool({
    ...dbConfig,
    database: process.env.DB_NAME || 'foodbridge_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  // Create tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS restaurants (
      restaurant_id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      phone VARCHAR(20) NOT NULL,
      address TEXT NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      email_verified TINYINT(1) NOT NULL DEFAULT 0,
      verification_token VARCHAR(255) DEFAULT NULL,
      verification_token_expires DATETIME DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS organizations (
      organization_id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      phone VARCHAR(20) NOT NULL,
      address TEXT NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      email_verified TINYINT(1) NOT NULL DEFAULT 0,
      verification_token VARCHAR(255) DEFAULT NULL,
      verification_token_expires DATETIME DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS food_listings (
      food_id INT AUTO_INCREMENT PRIMARY KEY,
      restaurant_id INT NOT NULL,
      food_name VARCHAR(255) NOT NULL,
      quantity VARCHAR(100) NOT NULL,
      description TEXT,
      expiry_time DATETIME NOT NULL,
      image_url VARCHAR(500),
      status ENUM('available', 'requested', 'accepted', 'volunteer_assigned', 'delivered') DEFAULT 'available',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(restaurant_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS food_requests (
      request_id INT AUTO_INCREMENT PRIMARY KEY,
      food_id INT NOT NULL,
      organization_id INT NOT NULL,
      request_status ENUM('pending', 'accepted', 'volunteer_assigned', 'delivered', 'rejected') DEFAULT 'pending',
      request_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (food_id) REFERENCES food_listings(food_id) ON DELETE CASCADE,
      FOREIGN KEY (organization_id) REFERENCES organizations(organization_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pickup_confirmations (
      pickup_id INT AUTO_INCREMENT PRIMARY KEY,
      request_id INT NOT NULL UNIQUE,
      pickup_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      confirmation_status ENUM('Confirmed', 'Pending') DEFAULT 'Confirmed',
      FOREIGN KEY (request_id) REFERENCES food_requests(request_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS admins (
      admin_id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      reset_id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      token VARCHAR(255) NOT NULL UNIQUE,
      user_type ENUM('restaurant', 'organization', 'administrator', 'volunteer') NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (email)
    );

    CREATE TABLE IF NOT EXISTS delivery_volunteers (
      volunteer_id INT AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      phone VARCHAR(20) NOT NULL,
      age INT NOT NULL,
      gender ENUM('Male', 'Female', 'Other') NOT NULL,
      vehicle_type ENUM('Bike', 'Scooter', 'Car', 'Cycle') NOT NULL,
      vehicle_number VARCHAR(50) NOT NULL,
      government_id VARCHAR(100),
      license_file_path VARCHAR(255) NOT NULL,
      profile_photo_path VARCHAR(255),
      address TEXT NOT NULL,
      working_hours_start TIME NOT NULL,
      working_hours_end TIME NOT NULL,
      emergency_contact VARCHAR(20) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      email_verified TINYINT(1) NOT NULL DEFAULT 0,
      verification_token VARCHAR(255) DEFAULT NULL,
      verification_token_expires DATETIME DEFAULT NULL,
      account_status ENUM('active', 'inactive') DEFAULT 'inactive',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS delivery_assignments (
      assignment_id INT AUTO_INCREMENT PRIMARY KEY,
      request_id INT NOT NULL,
      volunteer_id INT NOT NULL,
      assignment_status ENUM('assigned', 'picked_up', 'on_the_way', 'delivered') DEFAULT 'assigned',
      accepted_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      delivered_time TIMESTAMP NULL,
      FOREIGN KEY (request_id) REFERENCES food_requests(request_id) ON DELETE CASCADE,
      FOREIGN KEY (volunteer_id) REFERENCES delivery_volunteers(volunteer_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS volunteer_live_locations (
      location_id INT AUTO_INCREMENT PRIMARY KEY,
      volunteer_id INT NOT NULL,
      latitude DECIMAL(10, 8) NOT NULL,
      longitude DECIMAL(11, 8) NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (volunteer_id) REFERENCES delivery_volunteers(volunteer_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS delivery_tracking (
      delivery_id INT AUTO_INCREMENT PRIMARY KEY,
      request_id INT NOT NULL UNIQUE,
      restaurant_id INT NOT NULL,
      organization_id INT NOT NULL,
      volunteer_id INT,
      current_latitude DECIMAL(10, 8),
      current_longitude DECIMAL(11, 8),
      delivery_status ENUM('available', 'accepted', 'volunteer_assigned', 'delivered', 'rejected') DEFAULT 'available',
      last_updated_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (request_id) REFERENCES food_requests(request_id) ON DELETE CASCADE,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
      FOREIGN KEY (organization_id) REFERENCES organizations(organization_id) ON DELETE CASCADE,
      FOREIGN KEY (volunteer_id) REFERENCES delivery_volunteers(volunteer_id) ON DELETE SET NULL
    );
  `);

  // ─── Migration: add email verification columns (MySQL 5.7+ compatible) ─────
  const dbName = process.env.DB_NAME || 'foodbridge_db';

  async function columnExists(table, column) {
    const [rows] = await pool.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [dbName, table, column]
    );
    return rows.length > 0;
  }

  const columnsToAdd = [
    { table: 'restaurants',  column: 'email_verified',              ddl: 'TINYINT(1) NOT NULL DEFAULT 0' },
    { table: 'restaurants',  column: 'verification_token',          ddl: 'VARCHAR(255) DEFAULT NULL' },
    { table: 'restaurants',  column: 'verification_token_expires',  ddl: 'DATETIME DEFAULT NULL' },
    { table: 'restaurants',  column: 'working_hours',               ddl: "VARCHAR(100) DEFAULT NULL COMMENT 'e.g. 09:00 AM - 10:00 PM IST'" },
    { table: 'organizations',column: 'email_verified',              ddl: 'TINYINT(1) NOT NULL DEFAULT 0' },
    { table: 'organizations',column: 'verification_token',          ddl: 'VARCHAR(255) DEFAULT NULL' },
    { table: 'organizations',column: 'verification_token_expires',  ddl: 'DATETIME DEFAULT NULL' },
    { table: 'organizations',column: 'org_type',                    ddl: "ENUM('Orphanage','Old Age Home','Trust') DEFAULT NULL" },
    { table: 'organizations',column: 'sector',                      ddl: "ENUM('Government','Private') DEFAULT NULL" },
    { table: 'organizations',column: 'people_count',                ddl: 'INT DEFAULT NULL' },
    { table: 'food_listings',column: 'actual_expiry_time',          ddl: 'DATETIME DEFAULT NULL AFTER description' },
    { table: 'food_listings',column: 'original_price',              ddl: 'DECIMAL(10,2) DEFAULT NULL' },
    { table: 'food_listings',column: 'selling_price',               ddl: 'DECIMAL(10,2) DEFAULT NULL' },
  ];

  // Update the password_resets ENUM to include 'volunteer'
  try {
    await pool.query("ALTER TABLE `password_resets` MODIFY COLUMN `user_type` ENUM('restaurant', 'organization', 'administrator', 'volunteer') NOT NULL");
    console.log("✅ Migration: synchronized password_resets user_type ENUM");
  } catch (err) {
    console.error("⚠️ Migration: failed to update password_resets user_type ENUM (might already be up-to-date)");
  }

  for (const { table, column, ddl } of columnsToAdd) {
    if (!(await columnExists(table, column))) {
      await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`);
      console.log(`✅ Migration: added column ${column} to ${table}`);
    }
  }

  // ─── Migration: Align ENUMs ──────────────────────────────────────────────
  try {
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');
    await pool.query("ALTER TABLE food_listings MODIFY COLUMN status ENUM('available', 'requested', 'accepted', 'volunteer_assigned', 'picked_up', 'on_the_way', 'delivered') DEFAULT 'available'");
    await pool.query("ALTER TABLE food_requests MODIFY COLUMN request_status ENUM('pending', 'accepted', 'volunteer_assigned', 'picked_up', 'on_the_way', 'delivered', 'rejected') DEFAULT 'pending'");
    await pool.query("ALTER TABLE delivery_tracking MODIFY COLUMN delivery_status ENUM('available', 'accepted', 'volunteer_assigned', 'picked_up', 'on_the_way', 'delivered', 'rejected') DEFAULT 'available'");
    
    // Add unique constraint to delivery_assignments(request_id) if not exists
    try {
      await pool.query("ALTER TABLE delivery_assignments ADD CONSTRAINT UNIQUE (request_id)");
      console.log("✅ Migration: Added unique constraint to delivery_assignments(request_id)");
    } catch (e) {
      // Ignore if already exists
    }

    await pool.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log("✅ Migration: Aligned status ENUMs across tables.");
  } catch (err) {
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');
    console.error("⚠️ Migration: Error aligning status ENUMs:", err.message);
  }

  // Mark all pre-existing users (no token set) as already verified
  if (await columnExists('restaurants', 'email_verified')) {
    await pool.query(`UPDATE restaurants SET email_verified = 1 WHERE email_verified = 0 AND verification_token IS NULL`);
  }
  if (await columnExists('organizations', 'email_verified')) {
    await pool.query(`UPDATE organizations SET email_verified = 1 WHERE email_verified = 0 AND verification_token IS NULL`);
  }
  if (await columnExists('delivery_volunteers', 'email_verified')) {
    await pool.query(`UPDATE delivery_volunteers SET email_verified = 1, account_status = 'active' WHERE email_verified = 0 AND verification_token IS NULL`);
  }


  // ─── Insert default admin if none exists ────────────────────────────────────
  const [adminRows] = await pool.query('SELECT 1 FROM admins LIMIT 1');
  if (adminRows.length === 0) {
    const bcrypt = require('bcryptjs');
    const adminHash = await bcrypt.hash('Skn090118@', 12);
    await pool.query(
      'INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)',
      ['ResQfood Administrator', 'resqfoodnsk@gmail.com', adminHash]
    );
    console.log('✅ Default Admin created: resqfoodnsk@gmail.com / Skn090118@');
  }

  console.log('✅ Database and tables ready.');

  // Verify SMTP after DB is ready (non-blocking — failures are logged, not thrown)
  emailService.verifyConnection();

  return pool;
}

function getPool() {
  return pool;
}

module.exports = { initializeDatabase, getPool };
