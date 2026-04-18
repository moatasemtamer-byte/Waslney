const router = require('express').Router();
const db     = require('../db');
const { requireAuth, requireRole } = require('../auth');

// GET /api/trips
router.get('/', requireAuth, async (req, res) => {
  try {
    const [trips] = await db.query(`
      SELECT t.*,
             u.name  AS driver_name,
             u.car   AS driver_car,
             u.plate AS driver_plate,
             COALESCE(AVG(r.stars),0) AS avg_rating,
             COUNT(DISTINCT r.id) AS rating_count,
             (SELECT COALESCE(SUM(b.seats),0) FROM bookings b WHERE b.trip_id=t.id AND b.status='confirmed') AS booked_seats
      FROM trips t
      LEFT JOIN users   u ON u.id = t.driver_id
      LEFT JOIN ratings r ON r.driver_id = t.driver_id
      WHERE t.status IN ('upcoming','active')
      GROUP BY t.id
      ORDER BY t.date ASC, t.pickup_time ASC
    `);
    // Attach stops to each trip
    for (const trip of trips) {
      const [stops] = await db.query(
        'SELECT * FROM trip_stops WHERE trip_id=? ORDER BY stop_order ASC',
        [trip.id]
      );
      trip.stops = stops;
    }
    res.json(trips);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/trips/driver
router.get('/driver', requireAuth, requireRole('driver'), async (req, res) => {
  try {
    const [trips] = await db.query(`
      SELECT t.*,
             (SELECT COALESCE(SUM(b.seats),0) FROM bookings b WHERE b.trip_id=t.id AND b.status='confirmed') AS booked_seats
      FROM trips t WHERE t.driver_id=?
      ORDER BY t.date ASC, t.pickup_time ASC
    `, [req.user.id]);
    for (const trip of trips) {
      const [stops] = await db.query(
        'SELECT * FROM trip_stops WHERE trip_id=? ORDER BY stop_order ASC',
        [trip.id]
      );
      trip.stops = stops;
    }
    res.json(trips);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/trips/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const [trips] = await db.query(`
      SELECT t.*, u.name AS driver_name, u.car AS driver_car, u.plate AS driver_plate,
             COALESCE(AVG(r.stars),0) AS avg_rating
      FROM trips t
      LEFT JOIN users u ON u.id=t.driver_id
      LEFT JOIN ratings r ON r.driver_id=t.driver_id
      WHERE t.id=? GROUP BY t.id
    `, [req.params.id]);
    if (!trips.length) return res.status(404).json({ error: 'Trip not found' });

    const [bookings] = await db.query(`
      SELECT b.*, u.name AS passenger_name, c.status AS checkin_status
      FROM bookings b
      JOIN users u ON u.id=b.passenger_id
      LEFT JOIN checkins c ON c.booking_id=b.id
      WHERE b.trip_id=? AND b.status!='cancelled'
    `, [req.params.id]);

    const [stops] = await db.query(
      'SELECT * FROM trip_stops WHERE trip_id=? ORDER BY stop_order ASC',
      [req.params.id]
    );

    res.json({ ...trips[0], bookings, stops });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/trips — admin creates trip with stops
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { from_loc, to_loc, pickup_time, dropoff_time, date, price, total_seats, driver_id, stops } = req.body;
  if (!from_loc||!to_loc||!pickup_time||!date||!price||!driver_id)
    return res.status(400).json({ error: 'Missing required fields' });
  try {
    // Get coords from first pickup and last dropoff stop if provided
    let pickup_lat = null, pickup_lng = null, dropoff_lat = null, dropoff_lng = null;
    if (stops && stops.length) {
      const firstPickup = stops.find(s => s.type === 'pickup');
      const lastDropoff = [...stops].reverse().find(s => s.type === 'dropoff');
      if (firstPickup) { pickup_lat = firstPickup.lat; pickup_lng = firstPickup.lng; }
      if (lastDropoff) { dropoff_lat = lastDropoff.lat; dropoff_lng = lastDropoff.lng; }
    }

    const [result] = await db.query(
      'INSERT INTO trips (from_loc,to_loc,pickup_time,dropoff_time,date,price,total_seats,driver_id,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [from_loc, to_loc, pickup_time, dropoff_time||null, date, price, total_seats||16, driver_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng]
    );
    const tripId = result.insertId;

    // Save stops
    if (stops && stops.length) {
      for (let i = 0; i < stops.length; i++) {
        const s = stops[i];
        await db.query(
          'INSERT INTO trip_stops (trip_id, type, label, lat, lng, stop_order) VALUES (?,?,?,?,?,?)',
          [tripId, s.type, s.label || '', s.lat, s.lng, i]
        );
      }
    }

    await db.query('INSERT INTO notifications (user_id,message) VALUES (?,?)',
      [driver_id, `New trip assigned: ${from_loc} → ${to_loc} on ${date}`]);

    const [trip] = await db.query('SELECT * FROM trips WHERE id=?', [tripId]);
    const [savedStops] = await db.query('SELECT * FROM trip_stops WHERE trip_id=? ORDER BY stop_order', [tripId]);
    res.status(201).json({ ...trip[0], stops: savedStops });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/trips/:id — admin updates trip
router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { from_loc, to_loc, pickup_time, dropoff_time, date, price, driver_id, status, stops } = req.body;
  try {
    await db.query(
      'UPDATE trips SET from_loc=COALESCE(?,from_loc), to_loc=COALESCE(?,to_loc), pickup_time=COALESCE(?,pickup_time), dropoff_time=COALESCE(?,dropoff_time), date=COALESCE(?,date), price=COALESCE(?,price), driver_id=COALESCE(?,driver_id), status=COALESCE(?,status) WHERE id=?',
      [from_loc,to_loc,pickup_time,dropoff_time,date,price,driver_id,status, req.params.id]
    );

    // Update stops if provided
    if (stops) {
      await db.query('DELETE FROM trip_stops WHERE trip_id=?', [req.params.id]);
      for (let i = 0; i < stops.length; i++) {
        const s = stops[i];
        await db.query(
          'INSERT INTO trip_stops (trip_id, type, label, lat, lng, stop_order) VALUES (?,?,?,?,?,?)',
          [req.params.id, s.type, s.label || '', s.lat, s.lng, i]
        );
      }
      // Update main coords
      const firstPickup = stops.find(s => s.type === 'pickup');
      const lastDropoff = [...stops].reverse().find(s => s.type === 'dropoff');
      if (firstPickup || lastDropoff) {
        await db.query(
          'UPDATE trips SET pickup_lat=?, pickup_lng=?, dropoff_lat=?, dropoff_lng=? WHERE id=?',
          [firstPickup?.lat||null, firstPickup?.lng||null, lastDropoff?.lat||null, lastDropoff?.lng||null, req.params.id]
        );
      }
    }

    res.json({ message: 'Trip updated' });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/trips/:id/start
router.post('/:id/start', requireAuth, requireRole('driver'), async (req, res) => {
  try {
    await db.query("UPDATE trips SET status='active' WHERE id=? AND driver_id=?", [req.params.id, req.user.id]);
    res.json({ message: 'Trip started' });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/trips/:id/complete
router.post('/:id/complete', requireAuth, requireRole('driver'), async (req, res) => {
  try {
    const tripId = req.params.id;
    await db.query("UPDATE trips SET status='completed' WHERE id=? AND driver_id=?", [tripId, req.user.id]);
    await db.query("UPDATE bookings SET status='completed' WHERE trip_id=? AND status='confirmed'", [tripId]);

    const [bookings] = await db.query("SELECT passenger_id FROM bookings WHERE trip_id=?", [tripId]);
    for (const b of bookings) {
      await db.query('INSERT INTO notifications(user_id,message)VALUES(?,?)',
        [b.passenger_id, '🏁 Your trip is complete! Chat has been closed. Please rate your driver ⭐']);
    }

    // Emit socket so passengers see trip end instantly
    try {
      const { io } = require('../server');
      io.to(`trip:${tripId}`).emit('trip:completed', { tripId: parseInt(tripId) });
    } catch(_) {}

    // Pool trip full cleanup
    try {
      const [[trip]] = await db.query('SELECT is_pool FROM trips WHERE id=?', [tripId]);
      if (trip?.is_pool) {
        const [[poolGroup]] = await db.query('SELECT id FROM pool_groups WHERE trip_id=?', [tripId]);
        if (poolGroup) {
          const gid = poolGroup.id;
          await db.query('DELETE FROM pool_chat_messages WHERE trip_id=?', [tripId]);
          await db.query('DELETE FROM pool_chats WHERE trip_id=?', [tripId]);
          await db.query('DELETE FROM pool_invitations WHERE group_id=?', [gid]);
          await db.query('UPDATE pool_requests SET pool_group_id=NULL, status='completed' WHERE pool_group_id=?', [gid]);
          await db.query('DELETE FROM pool_groups WHERE id=?', [gid]);
        }
      }
    } catch(pe) { console.error('Pool cleanup:', pe.message); }

    // Also clean regular trip chat messages
    try {
      await db.query('DELETE FROM pool_chat_messages WHERE trip_id=?', [tripId]);
    } catch(_) {}

    res.json({ message: 'Trip completed' });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/trips/:id
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await db.query("UPDATE trips SET status='cancelled' WHERE id=?", [req.params.id]);
    const [bookings] = await db.query("SELECT passenger_id FROM bookings WHERE trip_id=? AND status='confirmed'", [req.params.id]);
    for (const b of bookings) {
      await db.query('INSERT INTO notifications (user_id,message) VALUES (?,?)',
        [b.passenger_id, `Trip cancelled by admin. Your booking has been refunded.`]);
    }
    await db.query("UPDATE bookings SET status='cancelled' WHERE trip_id=?", [req.params.id]);
    res.json({ message: 'Trip cancelled' });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
