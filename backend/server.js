require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const path       = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST','PUT','DELETE'] }
});

// ── MIDDLEWARE ────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── API ROUTES ────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/trips',         require('./routes/trips'));
app.use('/api/bookings',      require('./routes/bookings'));
app.use('/api/checkins',      require('./routes/checkins'));
app.use('/api/ratings',       require('./routes/ratings'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/location',      require('./routes/location'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/geocode',        require('./routes/geocode'));
app.use('/api/pool',           require('./routes/pool'));

// ── SOCKET.IO REAL-TIME TRACKING ──────────────────────────
require('./socket/tracking')(io);

// ── HEALTH CHECK ──────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// ── SERVE FRONTEND BUILD ──────────────────────────────────
const DIST = path.join(__dirname, 'public');
app.use(express.static(DIST));

// All non-API routes serve index.html (React SPA routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(DIST, 'index.html'));
});

// ── START ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
  console.log(`\n🚐  Shuttle running on http://localhost:${PORT}`);
  console.log(`🔌  Socket.io ready for real-time tracking`);
  console.log(`📦  API: http://localhost:${PORT}/api/health\n`);

  // Run DB migrations after server starts
  try {
    await require('./migrate')();
  } catch (e) {
    console.error('Migration error:', e.message);
  }
});
