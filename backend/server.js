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
// ── AUTO-EXPIRE: runs every hour ─────────────────────────────
async function autoExpirePoolGroups() {
  try {
    const db = require('./db');

    // 1. Expire pool groups older than 24h that never got a driver
    const [expiredGroups] = await db.query(`
      SELECT pg.id, pg.trip_id FROM pool_groups pg
      WHERE pg.status = 'pending'
        AND pg.created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `);
    for (const g of expiredGroups) {
      await db.query("UPDATE pool_groups SET status='cancelled' WHERE id=?", [g.id]);
      await db.query("UPDATE pool_requests SET status='cancelled' WHERE pool_group_id=?", [g.id]);
      const [members] = await db.query('SELECT passenger_id FROM pool_requests WHERE pool_group_id=?', [g.id]);
      for (const m of members) {
        await db.query('INSERT INTO notifications(user_id,message)VALUES(?,?)',
          [m.passenger_id, '⏰ Your Smart Pool group expired after 24 hours with no driver. Please try again.']);
      }
      console.log(`[AutoExpire] Pool group ${g.id} expired`);
    }

    // 2. Auto-complete trips that have been active for more than 24h (driver forgot to end)
    const [staleTripRows] = await db.query(`
      SELECT t.id, t.driver_id FROM trips t
      WHERE t.status = 'active'
        AND t.updated_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `);
    for (const t of staleTripRows) {
      await db.query("UPDATE trips SET status='completed' WHERE id=?", [t.id]);
      await db.query("UPDATE bookings SET status='completed' WHERE trip_id=? AND status='confirmed'", [t.id]);
      // Emit socket
      try { io.to(`trip:${t.id}`).emit('trip:completed', { tripId: t.id }); } catch(_) {}
      // Pool cleanup
      const [[pg]] = await db.query('SELECT id FROM pool_groups WHERE trip_id=?', [t.id]).catch(()=>[[null]]);
      if (pg) {
        await db.query('DELETE FROM pool_chat_messages WHERE trip_id=?', [t.id]).catch(()=>{});
        await db.query('DELETE FROM pool_chats WHERE trip_id=?', [t.id]).catch(()=>{});
        await db.query('UPDATE pool_requests SET pool_group_id=NULL WHERE pool_group_id=?', [pg.id]).catch(()=>{});
        await db.query('DELETE FROM pool_groups WHERE id=?', [pg.id]).catch(()=>{});
      }
      // Also clean regular chat
      await db.query('DELETE FROM pool_chat_messages WHERE trip_id=?', [t.id]).catch(()=>{});
      console.log(`[AutoExpire] Trip ${t.id} auto-completed after 24h`);
    }

    if (expiredGroups.length || staleTripRows.length) {
      console.log(`[AutoExpire] Done: ${expiredGroups.length} groups expired, ${staleTripRows.length} trips auto-completed`);
    }
  } catch(e) { console.error('[AutoExpire] Error:', e.message); }
}

server.listen(PORT, async () => {
  console.log(`\n🚐  Shuttle running on http://localhost:${PORT}`);
  console.log(`🔌  Socket.io ready for real-time tracking`);
  console.log(`📦  API: http://localhost:${PORT}/api/health\n`);
  // Run auto-expire every hour
  autoExpirePoolGroups(); // Run once on startup
  setInterval(autoExpirePoolGroups, 60 * 60 * 1000); // Then every hour

  // Run DB migrations after server starts
  try {
    await require('./migrate')();
  } catch (e) {
    console.error('Migration error:', e.message);
  }
});
