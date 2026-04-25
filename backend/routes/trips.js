const router = require('express').Router();
const db     = require('../db');
const { requireAuth, requireRole } = require('../auth');

// Helper to get the io instance safely (avoids circular-require issues)
function getIo() {
  try { return require('../server').io; } catch(_) { return null; }
}

// ── helper: attach week-assignment fields to a trip row ─────────────────────
async function attachWeekAssignment(trip, today) {
  try {
    const [wa] = await db.query(`
      SELECT wa.id, wa.week_start, wa.week_end,
             c.company_name AS assigned_company_name,
             c.phone        AS assigned_company_phone
      FROM trip_week_assignments wa
      JOIN companies c ON c.id = wa.company_id
      WHERE wa.trip_id = ? AND wa.week_start <= ? AND wa.week_end >= ?
      ORDER BY wa.created_at DESC LIMIT 1
    `, [trip.id, today, today]);

    if (!wa.length) return;

    trip.week_assignment_id      = wa[0].id;
    trip.week_start              = wa[0].week_start;
    trip.week_end                = wa[0].week_end;
    trip.assigned_company_name   = wa[0].assigned_company_name;
    trip.assigned_company_phone  = wa[0].assigned_company_phone;

    const [da] = await db.query(`
      SELECT cd.name AS daily_driver_name,
             cc.plate AS daily_car_plate,
             cc.model AS daily_car_model
      FROM trip_daily_assignments da
      LEFT JOIN company_drivers cd ON cd.id = da.driver_id
      LEFT JOIN company_cars    cc ON cc.id = da.car_id
      WHERE da.week_assignment_id = ? AND da.assignment_date = ?
      LIMIT 1
    `, [wa[0].id, today]);

    if (da.length) {
      trip.daily_driver_name = da[0].daily_driver_name;
      trip.daily_car_plate   = da[0].daily_car_plate;
      trip.daily_car_model   = da[0].daily_car_model;
    }
  } catch(e) {
    // Tables may not exist yet — silently skip
  }
}

// GET /api/trips
router.get('/', requireAuth, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [trips] = await db.query(`
      SELECT t.*,
             u.name  AS driver_name,
             u.car   AS driver_car,
             u.plate AS driver_plate,
             COALESCE((SELECT AVG(r2.stars) FROM ratings r2 WHERE r2.driver_id = t.driver_id), 0) AS avg_rating,
             COALESCE((SELECT COUNT(*) FROM ratings r2 WHERE r2.driver_id = t.driver_id), 0) AS rating_count,
             (SELECT COALESCE(SUM(b.seats),0) FROM bookings b WHERE b.trip_id=t.id AND b.status='confirmed') AS booked_seats
      FROM trips t
      LEFT JOIN users u ON u.id = t.driver_id
      WHERE t.status IN ('upcoming','active','tendered','awarded','assigned')
      ORDER BY t.date ASC, t.pickup_time ASC
    `);

    for (const trip of trips) {
      const [stops] = await db.query(
        'SELECT * FROM trip_stops WHERE trip_id=? ORDER BY stop_order ASC',
        [trip.id]
      );
      trip.stops = stops;
      await attachWeekAssignment(trip, today);
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
    const today = new Date().toISOString().slice(0, 10);
    const [trips] = await db.query(`
      SELECT t.*, u.name AS driver_name, u.car AS driver_car, u.plate AS driver_plate,
             COALESCE((SELECT AVG(r2.stars) FROM ratings r2 WHERE r2.driver_id = t.driver_id), 0) AS avg_rating
      FROM trips t
      LEFT JOIN users u ON u.id=t.driver_id
      WHERE t.id=?
    `, [req.params.id]);
    if (!trips.length) return res.status(404).json({ error: 'Trip not found' });

    const trip = trips[0];
    await attachWeekAssignment(trip, today);

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

    res.json({ ...trip, bookings, stops });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/trips — admin creates trip with stops
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { from_loc, to_loc, pickup_time, dropoff_time, date, price, total_seats, driver_id, stops, offer_tender } = req.body;
  if (!from_loc||!to_loc||!pickup_time||!date||!price||(!driver_id && !offer_tender))
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
      [from_loc, to_loc, pickup_time, dropoff_time||null, date, price, total_seats||16, driver_id||null, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng]
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

    if (driver_id) {
      await db.query('INSERT INTO notifications (user_id,message) VALUES (?,?)',
        [driver_id, `New trip assigned: ${from_loc} → ${to_loc} on ${date}`]);
    }

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
    const io = getIo();
    if (io) {
      const tripId = req.params.id;
      io.to(`trip:${tripId}`).emit('trip:started', { tripId });
      io.to('admin').emit('trip:status:changed', { tripId, status: 'active' });
    }
    res.json({ message: 'Trip started' });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/trips/:id/complete
router.post('/:id/complete', requireAuth, requireRole('driver'), async (req, res) => {
  try {
    await db.query("UPDATE trips SET status='completed' WHERE id=? AND driver_id=?", [req.params.id, req.user.id]);
    await db.query("UPDATE bookings SET status='completed' WHERE trip_id=? AND status='confirmed'", [req.params.id]);
    const [bookings] = await db.query("SELECT passenger_id FROM bookings WHERE trip_id=? AND status='completed'", [req.params.id]);
    for (const b of bookings) {
      await db.query('INSERT INTO notifications (user_id,message) VALUES (?,?)',
        [b.passenger_id, `Your trip is complete! Please rate your driver.`]);
    }
    const io = getIo();
    if (io) {
      const tripId = req.params.id;
      io.to(`trip:${tripId}`).emit('trip:completed', { tripId });
      io.to('admin').emit('trip:status:changed', { tripId, status: 'completed' });
    }
    // Pool trip cleanup
    try {
      const [[trip]] = await db.query('SELECT is_pool FROM trips WHERE id=?', [req.params.id]);
      if (trip && trip.is_pool) {
        const [[poolGroup]] = await db.query('SELECT id FROM pool_groups WHERE trip_id=?', [req.params.id]);
        if (poolGroup) {
          const gid = poolGroup.id;
          const [members] = await db.query('SELECT passenger_id FROM pool_requests WHERE pool_group_id=?', [gid]);
          for (const m of members) {
            await db.query('INSERT INTO notifications(user_id,message)VALUES(?,?)',
              [m.passenger_id, '🏁 Smart Pool complete! Group chat has been closed. Rate your driver ⭐']);
          }
          await db.query('DELETE FROM pool_chat_messages WHERE trip_id=?', [req.params.id]);
          await db.query('DELETE FROM pool_chats WHERE trip_id=?', [req.params.id]);
          await db.query('DELETE FROM pool_invitations WHERE group_id=?', [gid]);
          await db.query("UPDATE pool_requests SET pool_group_id=NULL, status='completed' WHERE pool_group_id=?", [gid]);
          await db.query('DELETE FROM pool_groups WHERE id=?', [gid]);
        }
      }
    } catch(pe) { console.error('Pool cleanup:', pe.message); }
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
