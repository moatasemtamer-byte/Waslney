const router = require('express').Router();
const db     = require('../db');
const { requireAuth, requireRole } = require('../auth');

// GET /api/bookings/mine
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT b.*,
             t.from_loc, t.to_loc, t.pickup_time, t.dropoff_time, t.date, t.price,
             t.status   AS trip_status,
             t.pickup_lat, t.pickup_lng, t.dropoff_lat, t.dropoff_lng,
             u.name     AS driver_name,
             u.car      AS driver_car,
             u.plate    AS driver_plate,
             c.status   AS checkin_status
      FROM bookings b
      JOIN trips  t ON t.id = b.trip_id
      JOIN users  u ON u.id = t.driver_id
      LEFT JOIN checkins c ON c.booking_id = b.id
      WHERE b.passenger_id = ?
      ORDER BY b.created_at DESC
    `, [req.user.id]);
    res.json(rows);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/bookings — passenger books seats
router.post('/', requireAuth, requireRole('passenger'), async (req, res) => {
  const { trip_id, seats, pickup_note } = req.body;
  if (!trip_id || !seats) return res.status(400).json({ error: 'trip_id and seats required' });
  if (seats < 1 || seats > 16) return res.status(400).json({ error: 'Invalid seat count' });

  try {
    // Trip must be upcoming or active
    const [tripRows] = await db.query(
      "SELECT * FROM trips WHERE id=? AND status IN ('upcoming','active')",
      [trip_id]
    );
    if (!tripRows.length) return res.status(404).json({ error: 'Trip not found or not available' });
    const trip = tripRows[0];

    // Check duplicate booking FIRST — before checking seats
    const [existing] = await db.query(
      "SELECT id FROM bookings WHERE trip_id=? AND passenger_id=? AND status='confirmed'",
      [trip_id, req.user.id]
    );
    if (existing.length) return res.status(409).json({ error: 'already_reserved' });

    // Only count CONFIRMED bookings on ACTIVE/UPCOMING trips
    const [[{ booked }]] = await db.query(`
      SELECT COALESCE(SUM(b.seats), 0) AS booked
      FROM bookings b
      JOIN trips t ON t.id = b.trip_id
      WHERE b.trip_id = ?
        AND b.status = 'confirmed'
        AND t.status IN ('upcoming', 'active')
    `, [trip_id]);

    if (booked + seats > trip.total_seats) {
      return res.status(409).json({
        error: `Not enough seats available. ${trip.total_seats - booked} seat${trip.total_seats - booked !== 1 ? 's' : ''} left.`
      });
    }

    const [result] = await db.query(
      'INSERT INTO bookings (trip_id, passenger_id, seats, pickup_note) VALUES (?,?,?,?)',
      [trip_id, req.user.id, seats, pickup_note || null]
    );
    const bookingId = result.insertId;

    // Create checkin row
    await db.query('INSERT INTO checkins (booking_id) VALUES (?)', [bookingId]);

    // Notify passenger
    await db.query('INSERT INTO notifications (user_id, message) VALUES (?,?)',
      [req.user.id, `Booking confirmed: ${trip.from_loc} → ${trip.to_loc} on ${trip.date}`]);

    // Notify driver
    await db.query('INSERT INTO notifications (user_id, message) VALUES (?,?)',
      [trip.driver_id, `New booking: ${seats} seat${seats > 1 ? 's' : ''} reserved on ${trip.from_loc} → ${trip.to_loc}`]);

    const [booking] = await db.query(`
      SELECT b.*, t.from_loc, t.to_loc, t.pickup_time, t.date, t.price,
             u.name AS driver_name, u.car AS driver_car, u.plate AS driver_plate
      FROM bookings b
      JOIN trips t ON t.id = b.trip_id
      JOIN users u ON u.id = t.driver_id
      WHERE b.id = ?
    `, [bookingId]);

    res.status(201).json(booking[0]);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/bookings/:id/cancel
router.put('/:id/cancel', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM bookings WHERE id=?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Booking not found' });
    const booking = rows[0];
    if (booking.passenger_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Forbidden' });
    await db.query("UPDATE bookings SET status='cancelled' WHERE id=?", [req.params.id]);
    res.json({ message: 'Booking cancelled' });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/bookings/trip/:tripId — admin/driver sees all bookings for a trip
router.get('/trip/:tripId', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT b.*, u.name AS passenger_name, u.phone AS passenger_phone,
             c.status AS checkin_status
      FROM bookings b
      JOIN users u ON u.id = b.passenger_id
      LEFT JOIN checkins c ON c.booking_id = b.id
      WHERE b.trip_id = ? AND b.status != 'cancelled'
    `, [req.params.tripId]);
    res.json(rows);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
