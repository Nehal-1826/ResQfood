'use strict';

require('dotenv').config();
const emailService = require('./services/emailService');
const mysql = require('mysql2/promise');

function getDbConfig() {
  const dbUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;
  if (dbUrl) {
    try {
      const parsed = new URL(dbUrl);
      const isSsl = process.env.DB_SSL === 'true' || 
                    process.env.DB_SSL === '1' || 
                    parsed.searchParams.get('ssl') === 'true' || 
                    parsed.searchParams.get('sslmode') === 'require';

      return {
        host: parsed.hostname,
        port: parsed.port ? parseInt(parsed.port, 10) : 3306,
        user: decodeURIComponent(parsed.username || ''),
        password: decodeURIComponent(parsed.password || ''),
        database: parsed.pathname ? parsed.pathname.replace(/^\//, '') : (process.env.DB_NAME || 'foodbridge_db'),
        ssl: isSsl ? { rejectUnauthorized: false } : undefined,
        multipleStatements: true,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      };
    } catch (e) {
      console.warn('⚠️ Error parsing DATABASE_URL, falling back to individual DB_* env vars');
    }
  }

  const isSsl = process.env.DB_SSL === 'true' || process.env.DB_SSL === '1';
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME || 'foodbridge_db',
    ssl: isSsl ? { rejectUnauthorized: false } : undefined,
    multipleStatements: true,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  };
}

function hasDbConfig() {
  return Boolean(
    process.env.DATABASE_URL ||
    process.env.MYSQL_URL ||
    (process.env.DB_HOST && process.env.DB_HOST !== 'localhost' && process.env.DB_HOST !== '127.0.0.1') ||
    (!process.env.VERCEL) // locally, localhost is valid
  );
}

let pool = null;
let initPromise = null;
let isInitialized = false;

function getPool() {
  if (!pool) {
    const config = getDbConfig();
    pool = mysql.createPool(config);
  }
  return pool;
}

async function initializeDatabase() {
  if (isInitialized) return pool;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!hasDbConfig() && process.env.VERCEL) {
      console.warn('⚠️ No remote database configured in Vercel environment variables (DB_HOST or DATABASE_URL).');
      return getPool();
    }

    const currentPool = getPool();
    const config = getDbConfig();

    try {
      // If local environment without SSL, attempt to create database if missing
      if (!process.env.VERCEL && !config.ssl && (config.host === 'localhost' || config.host === '127.0.0.1')) {
        try {
          const tempConn = await mysql.createConnection({
            host: config.host,
            port: config.port,
            user: config.user,
            password: config.password,
            multipleStatements: true,
          });
          await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\``);
          await tempConn.end();
        } catch (dbCreateErr) {
          // Ignore if permission denied; database might already exist
        }
      }

      // Check database connection
      const connection = await currentPool.getConnection();
      connection.release();

      // Create base tables
      await currentPool.query(`
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
          working_hours VARCHAR(100) DEFAULT NULL,
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
          org_type ENUM('Orphanage','Old Age Home','Trust') DEFAULT NULL,
          sector ENUM('Government','Private') DEFAULT NULL,
          people_count INT DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS food_listings (
          food_id INT AUTO_INCREMENT PRIMARY KEY,
          restaurant_id INT NOT NULL,
          food_name VARCHAR(255) NOT NULL,
          quantity VARCHAR(100) NOT NULL,
          description TEXT,
          actual_expiry_time DATETIME DEFAULT NULL,
          original_price DECIMAL(10,2) DEFAULT NULL,
          selling_price DECIMAL(10,2) DEFAULT NULL,
          expiry_time DATETIME NOT NULL,
          image_url VARCHAR(500),
          status ENUM('available', 'requested', 'accepted', 'volunteer_assigned', 'picked_up', 'on_the_way', 'delivered') DEFAULT 'available',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (restaurant_id) REFERENCES restaurants(restaurant_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS food_requests (
          request_id INT AUTO_INCREMENT PRIMARY KEY,
          food_id INT NOT NULL,
          organization_id INT NOT NULL,
          request_status ENUM('pending', 'accepted', 'volunteer_assigned', 'picked_up', 'on_the_way', 'delivered', 'rejected') DEFAULT 'pending',
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
          request_id INT NOT NULL UNIQUE,
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
          delivery_status ENUM('available', 'accepted', 'volunteer_assigned', 'picked_up', 'on_the_way', 'delivered', 'rejected') DEFAULT 'available',
          last_updated_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (request_id) REFERENCES food_requests(request_id) ON DELETE CASCADE,
          FOREIGN KEY (restaurant_id) REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
          FOREIGN KEY (organization_id) REFERENCES organizations(organization_id) ON DELETE CASCADE,
          FOREIGN KEY (volunteer_id) REFERENCES delivery_volunteers(volunteer_id) ON DELETE SET NULL
        );
      `);

      // ─── Migrations for pre-existing tables ──────────────────────────────────
      const dbName = config.database;

      async function columnExists(table, column) {
        try {
          const [rows] = await currentPool.query(
            `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
            [dbName, table, column]
          );
          return rows.length > 0;
        } catch (e) {
          return false;
        }
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

      for (const { table, column, ddl } of columnsToAdd) {
        try {
          if (!(await columnExists(table, column))) {
            await currentPool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`);
            console.log(`✅ Migration: added column ${column} to ${table}`);
          }
        } catch (e) {
          // Ignore if column already exists
        }
      }

      // Sync password_resets user_type ENUM
      try {
        await currentPool.query("ALTER TABLE `password_resets` MODIFY COLUMN `user_type` ENUM('restaurant', 'organization', 'administrator', 'volunteer') NOT NULL");
      } catch (err) {}

      // Align ENUMs across tables
      try {
        await currentPool.query('SET FOREIGN_KEY_CHECKS = 0');
        await currentPool.query("ALTER TABLE food_listings MODIFY COLUMN status ENUM('available', 'requested', 'accepted', 'volunteer_assigned', 'picked_up', 'on_the_way', 'delivered') DEFAULT 'available'");
        await currentPool.query("ALTER TABLE food_requests MODIFY COLUMN request_status ENUM('pending', 'accepted', 'volunteer_assigned', 'picked_up', 'on_the_way', 'delivered', 'rejected') DEFAULT 'pending'");
        await currentPool.query("ALTER TABLE delivery_tracking MODIFY COLUMN delivery_status ENUM('available', 'accepted', 'volunteer_assigned', 'picked_up', 'on_the_way', 'delivered', 'rejected') DEFAULT 'available'");
        await currentPool.query('SET FOREIGN_KEY_CHECKS = 1');
      } catch (err) {
        try { await currentPool.query('SET FOREIGN_KEY_CHECKS = 1'); } catch (e) {}
      }

      // Mark pre-existing users as verified
      try {
        if (await columnExists('restaurants', 'email_verified')) {
          await currentPool.query(`UPDATE restaurants SET email_verified = 1 WHERE email_verified = 0 AND verification_token IS NULL`);
        }
        if (await columnExists('organizations', 'email_verified')) {
          await currentPool.query(`UPDATE organizations SET email_verified = 1 WHERE email_verified = 0 AND verification_token IS NULL`);
        }
        if (await columnExists('delivery_volunteers', 'email_verified')) {
          await currentPool.query(`UPDATE delivery_volunteers SET email_verified = 1, account_status = 'active' WHERE email_verified = 0 AND verification_token IS NULL`);
        }
      } catch (e) {}

      // Insert default admin if none exists
      try {
        const [adminRows] = await currentPool.query('SELECT 1 FROM admins LIMIT 1');
        if (adminRows.length === 0) {
          const bcrypt = require('bcryptjs');
          const adminHash = await bcrypt.hash('Skn090118@', 12);
          await currentPool.query(
            'INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)',
            ['ResQfood Administrator', 'resqfoodnsk@gmail.com', adminHash]
          );
          console.log('✅ Default Admin created: resqfoodnsk@gmail.com / Skn090118@');
        }
      } catch (e) {}

      isInitialized = true;
      console.log('✅ Database and tables ready.');
    } catch (err) {
      console.warn(`⚠️ Database connection/initialization warning: ${err.message}`);
      console.warn('   Ensure DB_HOST, DB_USER, DB_PASSWORD, DB_NAME (and DB_PORT/DB_SSL if needed) are configured.');
    }

    // Verify SMTP (non-blocking)
    try {
      emailService.verifyConnection();
    } catch (e) {}

    return currentPool;
  })();

  return initPromise;
}

function formatDbError(err, fallback = 'Server error occurred.') {
  if (!err) return fallback;
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
    return 'Database connection failed. Please ensure DB_HOST or DATABASE_URL is configured in Vercel Environment Variables.';
  }
  if (err.code === 'ER_ACCESS_DENIED_ERROR') {
    return 'Database access denied. Please verify DB_USER and DB_PASSWORD in Vercel settings.';
  }
  if (err.code === 'ER_BAD_DB_ERROR') {
    return 'Database name not found. Please verify DB_NAME in Vercel settings.';
  }
  return err.message || fallback;
}

module.exports = { initializeDatabase, getPool, getDbConfig, formatDbError, hasDbConfig };
