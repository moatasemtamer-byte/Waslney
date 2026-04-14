const db = require('../db');

module.exports = function setupTracking(io) {
  // Map: socketId → { userId, role, tripId, name }
  const connections = new Map();

  io.on('connection', (socket) => {

    // ── AUTH ──────────────────────────────────────────────
    socket.on('auth', async ({ userId, role, tripId }) => {
      // Fetch the user's real name from DB
      let name = 'Driver';
      try {
        const [rows] = await db.query('SELECT name FROM users WHERE id=?', [userId]);
        if (rows.length) name = rows[0].name;
      } catch (_) {}

      connections.set(socket.id, { userId, role, tripId, name });

      // Join personal room so we can send targeted events (e.g. pool:confirmed)
      socket.join(`user:${userId}`);

      if (tripId) {
        socket.join(`trip:${tripId}`);
        console.log(`🔌  ${role} ${name} joined room trip:${tripId}`);
      }
    });

    // ── DRIVER SENDS LOCATION ─────────────────────────────
    socket.on('driver:location', async ({ tripId, lat, lng }) => {
      const conn = connections.get(socket.id);
      if (!conn || conn.role !== 'driver') return;

      try {
        await db.query(`
          INSERT INTO driver_locations (driver_id, trip_id, lat, lng)
          VALUES (?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE trip_id=VALUES(trip_id), lat=VALUES(lat), lng=VALUES(lng), updated_at=NOW()
        `, [conn.userId, tripId, lat, lng]);

        // Include driver name in broadcast so passenger map shows real name
        socket.to(`trip:${tripId}`).emit('driver:location', {
          lat, lng,
          driverId: conn.userId,
          driverName: conn.name,
          timestamp: new Date().toISOString(),
        });

        io.to('admin').emit('driver:location:all', {
          driverId: conn.userId,
          driverName: conn.name,
          tripId, lat, lng,
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

    // ── TRIP EVENTS ───────────────────────────────────────
    socket.on('trip:started',   ({ tripId }) => { io.to(`trip:${tripId}`).emit('trip:started',   { tripId }); });
    socket.on('trip:completed', ({ tripId }) => { io.to(`trip:${tripId}`).emit('trip:completed', { tripId }); });

    // ── POOL CONFIRMED — notify passengers instantly ──────
    // Driver emits this after accepting; each passenger in their user room gets it
    socket.on('pool:confirmed', ({ tripId, passengerIds }) => {
      if (!Array.isArray(passengerIds)) return;
      passengerIds.forEach(pid => {
        io.to(`user:${pid}`).emit('pool:confirmed', { tripId });
      });
    });

    // ── FARE OFFER — driver sets fare, each passenger notified ──
    // Driver emits this after setting fare; each passenger sees accept/refuse modal
    socket.on('fare:offer', ({ tripId, passengerIds, bookings, farePerPassenger, fromLoc, toLoc }) => {
      if (!Array.isArray(passengerIds)) return;
      passengerIds.forEach((pid, i) => {
        io.to(`user:${pid}`).emit('fare:offer', {
          tripId,
          bookingId: bookings[i]?.bookingId,
          fare_per_passenger: farePerPassenger,
          from_loc: fromLoc,
          to_loc: toLoc,
        });
      });
      console.log(`💰  Fare offer emitted for trip ${tripId} → ${passengerIds.length} passengers`);
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
