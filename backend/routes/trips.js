const router = require('express').Router();
const db     = require('../db');
const { requireAuth, requireRole } = require('../auth');

const bookedSeatsQuery = `
  SELECT COALESCE(SUM(seats),0) as booked
  FROM bookings WHERE trip_id=? AND status!='cancelled'
`;

// GET /api/trips  — search available trips
router.get('/', requireAuth, async (req, res) => {
  try {
    const [trips] = await db.query(`
      SELECT t.*,
             u.name  AS driver_name,
             u.car   AS driver_car,
             u.plate AS driver_plate,
             COALESCE(AVG(r.stars),0) AS avg_rating,
             COUNT(DISTINCT r.id) AS rating_count,
             (SELECT COALESCE(SUM(b.seats),0) FROM bookings b WHERE b.trip_id=t.id AND b.status!='cancelled') AS booked_seats
      FROM trips t
      LEFT JOIN users   u ON u.id = t.driver_id
      LEFT JOIN ratings r ON r.driver_id = t.driver_id
      WHERE t.status IN ('upcoming','active')
      GROUP BY t.id
      ORDER BY t.date ASC, t.pickup_time ASC
    `);
    res.json(trips);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/trips/driver  — trips assigned to the logged-in driver
router.get('/driver', requireAuth, requireRole('driver'), async (req, res) => {
  try {
    const [trips] = await db.query(`
      SELECT t.*,
             (SELECT COALESCE(SUM(b.seats),0) FROM bookings b WHERE b.trip_id=t.id AND b.status!='cancelled') AS booked_seats
      FROM trips t WHERE t.driver_id=?
      ORDER BY t.date ASC, t.pickup_time ASC
    `, [req.user.id]);
    res.json(trips);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/trips/:id  — single trip with passengers
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

    res.json({ ...trips[0], bookings });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/trips  — admin creates trip
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { from_loc, to_loc, pickup_time, dropoff_time, date, price, total_seats, driver_id } = req.body;
  if (!from_loc||!to_loc||!pickup_time||!date||!price||!driver_id)
    return res.status(400).json({ error: 'Missing required fields' });
  try {
    const [result] = await db.query(
      'INSERT INTO trips (from_loc,to_loc,pickup_time,dropoff_time,date,price,total_seats,driver_id) VALUES (?,?,?,?,?,?,?,?)',
      [from_loc, to_loc, pickup_time, dropoff_time||null, date, price, total_seats||16, driver_id]
    );
    // Notify driver
    await db.query('INSERT INTO notifications (user_id,message) VALUES (?,?)',
      [driver_id, `New trip assigned: ${from_loc} → ${to_loc} on ${date}`]);
    const [trip] = await db.query('SELECT * FROM trips WHERE id=?', [result.insertId]);
    res.status(201).json(trip[0]);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/trips/:id  — admin updates trip
router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { from_loc, to_loc, pickup_time, dropoff_time, date, price, driver_id, status } = req.body;
  try {
    await db.query(
      'UPDATE trips SET from_loc=COALESCE(?,from_loc), to_loc=COALESCE(?,to_loc), pickup_time=COALESCE(?,pickup_time), dropoff_time=COALESCE(?,dropoff_time), date=COALESCE(?,date), price=COALESCE(?,price), driver_id=COALESCE(?,driver_id), status=COALESCE(?,status) WHERE id=?',
      [from_loc,to_loc,pickup_time,dropoff_time,date,price,driver_id,status, req.params.id]
    );
    res.json({ message: 'Trip updated' });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/trips/:id/start  — driver starts trip
router.post('/:id/start', requireAuth, requireRole('driver'), async (req, res) => {
  try {
    await db.query("UPDATE trips SET status='active' WHERE id=? AND driver_id=?", [req.params.id, req.user.id]);
    res.json({ message: 'Trip started' });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/trips/:id/complete  — driver completes trip
router.post('/:id/complete', requireAuth, requireRole('driver'), async (req, res) => {
  try {
    await db.query("UPDATE trips SET status='completed' WHERE id=? AND driver_id=?", [req.params.id, req.user.id]);
    await db.query("UPDATE bookings SET status='completed' WHERE trip_id=? AND status='confirmed'", [req.params.id]);
    // Notify passengers to rate
    const [bookings] = await db.query("SELECT passenger_id FROM bookings WHERE trip_id=? AND status='completed'", [req.params.id]);
    for (const b of bookings) {
      await db.query('INSERT INTO notifications (user_id,message) VALUES (?,?)',
        [b.passenger_id, `Your trip is complete! Please rate your driver.`]);
    }
    res.json({ message: 'Trip completed' });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/trips/:id  — admin cancels trip
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
