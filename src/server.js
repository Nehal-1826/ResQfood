'use strict';

require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const os        = require('os');
const fs        = require('fs');
const http      = require('http');
const { Server } = require('socket.io');

const { initializeDatabase } = require('./db');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*' }
});

// Expose io instance to be used in routes
app.set('io', io);

const PORT = process.env.PORT || 3000;

// ─── Socket.io Connection ──────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // Clients can join a room based on delivery_id
  socket.on('join_delivery', (deliveryId) => {
    socket.join(`delivery_${deliveryId}`);
    console.log(`📡 Socket ${socket.id} joined delivery room: ${deliveryId}`);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Static Files ──────────────────────────────────────────────────────────────
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

// Fallback upload directory for serverless environments (e.g. Vercel)
const tmpUploadsDir = path.join(os.tmpdir(), 'uploads');
if (!fs.existsSync(tmpUploadsDir)) {
  try { fs.mkdirSync(tmpUploadsDir, { recursive: true }); } catch (e) {}
}
app.use('/uploads', express.static(tmpUploadsDir));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/authRoutes'));
app.use('/api/auth',       require('./routes/passwordRoutes'));
app.use('/api/foods',      require('./routes/foodRoutes'));
app.use('/api/requests',   require('./routes/requestRoutes'));
app.use('/api/pickups',    require('./routes/pickupRoutes'));
app.use('/api/admin',      require('./routes/adminRoutes'));
app.use('/api/deliveries', require('./routes/deliveryRoutes'));
app.use('/api/profile',    require('./routes/profileRoutes'));

// ─── Health check route ────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    environment: process.env.VERCEL ? 'vercel-serverless' : 'standalone',
    timestamp: new Date().toISOString()
  });
});

// ─── HTML Page Routes ──────────────────────────────────────────────────────────
app.get('/',                    (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.get('/auth',                (req, res) => res.sendFile(path.join(publicDir, 'auth.html')));
app.get('/forgot-password',     (req, res) => res.sendFile(path.join(publicDir, 'forgot-password.html')));
app.get('/reset-password',      (req, res) => res.sendFile(path.join(publicDir, 'reset-password.html')));
app.get('/restaurant-dashboard',(req, res) => res.sendFile(path.join(publicDir, 'restaurant-dashboard.html')));
app.get('/ngo-dashboard',       (req, res) => res.sendFile(path.join(publicDir, 'ngo-dashboard.html')));
app.get('/admin-dashboard',     (req, res) => res.sendFile(path.join(publicDir, 'admin-dashboard.html')));
app.get('/volunteer-dashboard', (req, res) => res.sendFile(path.join(publicDir, 'volunteer-dashboard.html')));
app.get('/food-listings',       (req, res) => res.sendFile(path.join(publicDir, 'food-listings.html')));
app.get('/request-tracking',    (req, res) => res.sendFile(path.join(publicDir, 'request-tracking.html')));
app.get('/pickup-confirmation', (req, res) => res.sendFile(path.join(publicDir, 'pickup-confirmation.html')));
app.get('/delivery-tracking',   (req, res) => res.sendFile(path.join(publicDir, 'delivery-tracking.html')));
app.get('/volunteer-tracking',  (req, res) => res.sendFile(path.join(publicDir, 'volunteer-tracking.html')));
app.get(['/favicon.ico', '/favicon.png'], (req, res) => res.sendFile(path.join(publicDir, 'images/logo.png')));

// ─── API Config Route ──────────────────────────────────────────────────────────
app.get('/api/config/maps', (req, res) => {
  res.json({ success: true, apiKey: process.env.GOOGLE_MAPS_API_KEY || '' });
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.accepts('html')) {
    return res.status(404).sendFile(path.join(publicDir, 'index.html'));
  }
  res.status(404).json({ success: false, message: 'Route not found.' });
});

// ─── Global Error Handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: err.message || 'Internal server error.' });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Get the machine's LAN IPv4 address */
function getLocalIP() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

/**
 * Update a key=value pair in the .env file.
 * Safe for serverless (skips if in Vercel or read-only filesystem).
 */
function updateEnvFile(key, value) {
  if (process.env.VERCEL) return;
  try {
    const envPath = path.join(__dirname, '../.env');
    let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content = content.trimEnd() + `\n${key}=${value}\n`;
    }
    fs.writeFileSync(envPath, content, 'utf8');
  } catch (err) {
    // Non-fatal if filesystem is read-only
  }
}

/**
 * Try to start an ngrok tunnel (local dev only).
 */
async function startNgrokTunnel(port) {
  if (process.env.VERCEL) return null;
  const token = process.env.NGROK_AUTH_TOKEN;
  if (!token) return null;

  try {
    const ngrok = require('@ngrok/ngrok');
    const listener = await ngrok.forward({
      addr:     port,
      authtoken: token,
    });
    return listener.url();
  } catch (err) {
    console.error('❌ ngrok tunnel failed:', err.message);
    return null;
  }
}

// ─── Start Standalone Server ──────────────────────────────────────────────────
async function startServer() {
  try {
    await initializeDatabase();

    server.listen(PORT, async () => {
      const localIP  = getLocalIP();
      const localUrl = `http://${localIP}:${PORT}`;
      const publicUrl = await startNgrokTunnel(PORT);
      const appUrl = publicUrl || process.env.APP_URL || localUrl;

      process.env.APP_URL = appUrl;
      updateEnvFile('APP_URL', appUrl);

      console.log('\n╔══════════════════════════════════════════════════════════╗');
      console.log('║            🌉  RESQFOOD SERVER READY                    ║');
      console.log('╠══════════════════════════════════════════════════════════╣');
      console.log(`║  Local       : http://localhost:${PORT}                     `);
      console.log(`║  Network     : ${localUrl}`);
      if (publicUrl) {
        console.log(`║  🌐 Public   : ${publicUrl}   ← use this for email links`);
        console.log('║  ✅ ngrok tunnel active — email links work for ANYONE    ');
      } else {
        console.log('║  ⚠️  No ngrok token — email links work on same WiFi only ');
        console.log('║     Add NGROK_AUTH_TOKEN to .env for public email links   ');
      }
      console.log('╚══════════════════════════════════════════════════════════╝\n');
    });
  } catch (err) {
    console.error('❌ Failed to start standalone server:', err.message);
    if (!process.env.VERCEL) {
      process.exit(1);
    }
  }
}

// Export Express app for Vercel / serverless runtimes
module.exports = app;

// Run standalone server if executed directly (e.g. `node src/server.js` or `npm start`)
if (require.main === module) {
  startServer();
}
