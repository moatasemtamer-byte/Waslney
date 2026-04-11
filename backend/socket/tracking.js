const db = require('../db');

module.exports = function setupTracking(io) {
  // Map: socketId → { userId, role, tripId }
  const connections = new Map();

  io.on('connection', (socket) => {
    // ── AUTH ──────────────────────────────────────────────
    socket.on('auth', ({ userId, role, tripId }) => {
      connections.set(socket.id, { userId, role, tripId });

      if (tripId) {
        socket.join(`trip:${tripId}`);
        console.log(`🔌  ${role} ${userId} joined room trip:${tripId}`);
      }
    });

    // ── DRIVER SENDS LOCATION ─────────────────────────────
    // Emitted every 4 seconds by driver client
    socket.on('driver:location', async ({ tripId, lat, lng }) => {
      const conn = connections.get(socket.id);
      if (!conn || conn.role !== 'driver') return;

      try {
        // Persist to MySQL (upsert)
        await db.query(`
          INSERT INTO driver_locations (driver_id, trip_id, lat, lng)
          VALUES (?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE trip_id=VALUES(trip_id), lat=VALUES(lat), lng=VALUES(lng), updated_at=NOW()
        `, [conn.userId, tripId, lat, lng]);

        // Broadcast to all passengers watching this trip
        socket.to(`trip:${tripId}`).emit('driver:location', {
          lat, lng,
          driverId: conn.userId,
          timestamp: new Date().toISOString(),
        });

        // Also broadcast to admin room
        io.to('admin').emit('driver:location:all', {
          driverId: conn.userId,
          tripId,
          lat, lng,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.error('Location save error:', err.message);
      }
    });

    // ── ADMIN JOINS GLOBAL ROOM ───────────────────────────
    socket.on('join:admin', () => {
      socket.join('admin');
      console.log(`🔌  Admin joined global room`);
    });

    // ── PASSENGER WATCHES A TRIP ──────────────────────────
    socket.on('watch:trip', ({ tripId }) => {
      socket.join(`trip:${tripId}`);
      const conn = connections.get(socket.id) || {};
      connections.set(socket.id, { ...conn, tripId });
    });

    // ── TRIP EVENTS (start / complete) ────────────────────
    socket.on('trip:started', ({ tripId }) => {
      io.to(`trip:${tripId}`).emit('trip:started', { tripId });
    });
    socket.on('trip:completed', ({ tripId }) => {
      io.to(`trip:${tripId}`).emit('trip:completed', { tripId });
    });

    // ── CHECKIN UPDATE ────────────────────────────────────
    socket.on('checkin:update', ({ tripId, bookingId, status }) => {
      io.to(`trip:${tripId}`).emit('checkin:update', { bookingId, status });
    });

    // ── DISCONNECT ────────────────────────────────────────
    socket.on('disconnect', () => {
      connections.delete(socket.id);
    });
  });
};
