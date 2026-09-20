require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const os        = require('os');
const fs        = require('fs');
const http      = require('http');
const { Server } = require('socket.io');

const { initializeDatabase } = require('./db');

const app  = express();
const server = http.createServer(app);
const io = new Server(server, {
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
app.use(express.static(path.join(__dirname, '../public')));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',    require('./routes/authRoutes'));
app.use('/api/auth',    require('./routes/passwordRoutes'));
app.use('/api/foods',   require('./routes/foodRoutes'));
app.use('/api/requests',require('./routes/requestRoutes'));
app.use('/api/pickups', require('./routes/pickupRoutes'));
app.use('/api/admin',   require('./routes/adminRoutes'));
app.use('/api/deliveries', require('./routes/deliveryRoutes'));
app.use('/api/profile', require('./routes/profileRoutes'));

// ─── HTML Page Routes ──────────────────────────────────────────────────────────
app.get('/',                    (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));
app.get('/auth',                (req, res) => res.sendFile(path.join(__dirname, '../public/auth.html')));
app.get('/forgot-password',     (req, res) => res.sendFile(path.join(__dirname, '../public/forgot-password.html')));
app.get('/reset-password',      (req, res) => res.sendFile(path.join(__dirname, '../public/reset-password.html')));
app.get('/restaurant-dashboard',(req, res) => res.sendFile(path.join(__dirname, '../public/restaurant-dashboard.html')));
app.get('/ngo-dashboard',       (req, res) => res.sendFile(path.join(__dirname, '../public/ngo-dashboard.html')));
app.get('/admin-dashboard',     (req, res) => res.sendFile(path.join(__dirname, '../public/admin-dashboard.html')));
app.get('/volunteer-dashboard', (req, res) => res.sendFile(path.join(__dirname, '../public/volunteer-dashboard.html')));
app.get('/food-listings',       (req, res) => res.sendFile(path.join(__dirname, '../public/food-listings.html')));
app.get('/request-tracking',    (req, res) => res.sendFile(path.join(__dirname, '../public/request-tracking.html')));
app.get('/pickup-confirmation', (req, res) => res.sendFile(path.join(__dirname, '../public/pickup-confirmation.html')));
app.get('/delivery-tracking',   (req, res) => res.sendFile(path.join(__dirname, '../public/delivery-tracking.html')));
app.get('/volunteer-tracking',  (req, res) => res.sendFile(path.join(__dirname, '../public/volunteer-tracking.html')));

// ─── API Config Route ──────────────────────────────────────────────────────────
app.get('/api/config/maps', (req, res) => {
  res.json({ success: true, apiKey: process.env.GOOGLE_MAPS_API_KEY || '' });
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
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
 * Adds the line if missing, updates it if it exists.
 */
function updateEnvFile(key, value) {
  const envPath = path.join(__dirname, '../.env');
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content = content.trimEnd() + `\n${key}=${value}\n`;
  }
  fs.writeFileSync(envPath, content, 'utf8');
}

/**
 * Try to start an ngrok tunnel.
 * Returns the public URL, or null if NGROK_AUTH_TOKEN is not set.
 */
async function startNgrokTunnel(port) {
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

// ─── Start Server ─────────────────────────────────────────────────────────────
async function startServer() {
  try {
    await initializeDatabase();

    server.listen(PORT, async () => {
      // 1. Detect local IP and always update APP_URL with it first
      const localIP  = getLocalIP();
      const localUrl = `http://${localIP}:${PORT}`;

      // 2. Try to start ngrok for a public URL
      const publicUrl = await startNgrokTunnel(PORT);

      // 3. Use ngrok URL if available, otherwise fall back to LAN IP
      const appUrl = publicUrl || localUrl;
      process.env.APP_URL = appUrl;       // update in-process immediately
      updateEnvFile('APP_URL', appUrl);   // persist to .env for next restart

      // ── Print startup banner ──────────────────────────────────────────────
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
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

startServer();
