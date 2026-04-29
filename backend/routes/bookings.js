const router = require('express').Router();
const db     = require('../db');
const { requireAuth, requireRole } = require('../auth');

function getIo() {
  try { return require('../server').io; } catch(_) { return null; }
}

// ── Booking Settings helpers ────────────────────────────────────────────────
async function getBookingSettings() {
  try {
    const [rows] = await db.query('SELECT * FROM booking_settings WHERE id = 1');
    if (rows.length) return rows[0];
  } catch(_) {}
  return { booking_round_start_day: 5, surge_percent: 10, surge_after_friday: 1 };
}

async function computePrice(basePrice, travelDate) {
  const settings = await getBookingSettings();
  if (!settings.surge_after_friday) return basePrice;
  const roundStartDay = settings.booking_round_start_day ?? 5;
  const today = new Date(); today.setHours(0,0,0,0);
  const todayDay = today.getDay();
  const bookingMadeOnSurgeDay = (todayDay === roundStartDay || todayDay === (roundStartDay + 1) % 7);
  if (bookingMadeOnSurgeDay) {
    return Math.round(basePrice * (1 + (settings.surge_percent / 100)));
  }
  return basePrice;
}

// GET /api/bookings/settings
router.get('/settings', requireAuth, async (req, res) => {
  try { res.json(await getBookingSettings()); }
  catch(err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/bookings/settings — admin only
router.put('/settings', requireAuth, requireRole('admin'), async (req, res) => {
  const { booking_round_start_day, surge_percent, surge_after_friday } = req.body;
  try {
    await db.query(`
      INSERT INTO booking_settings (id, booking_round_start_day, surge_percent, surge_after_friday)
      VALUES (1, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        booking_round_start_day = VALUES(booking_round_start_day),
        surge_percent           = VALUES(surge_percent),
        surge_after_friday      = VALUES(surge_after_friday)
    `, [booking_round_start_day ?? 5, surge_percent ?? 10, surge_after_friday ? 1 : 0]);
    res.json({ message: 'Settings saved' });
  } catch(err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/bookings/week-schedule?trip_id=X
router.get('/week-schedule', requireAuth, async (req, res) => {
  const { trip_id } = req.query;
  if (!trip_id) return res.status(400).json({ error: 'trip_id required' });
  try {
    const [tripRows] = await db.query('SELECT * FROM trips WHERE id = ? AND status IN (\'upcoming\',\'active\',\'tendered\',\'awarded\',\'assigned\')', [trip_id]);
    if (!tripRows.length) return res.status(404).json({ error: 'Trip not found' });
    const trip = tripRows[0];
    const today = new Date(); today.setHours(0,0,0,0);
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      if (d.getDay() === 5) continue; // skip Friday
      days.push(d.toISOString().slice(0, 10));
    }
    const schedule = [];
    for (const date of days) {
      const [[{ booked }]] = await db.query(
        "SELECT COALESCE(SUM(seats),0) AS booked FROM bookings WHERE trip_id=? AND travel_date=? AND status='confirmed'",
        [trip_id, date]
      );
      const effectivePrice = await computePrice(trip.price, date);
      const d = new Date(date);
      schedule.push({
        date, day_name: dayNames[d.getDay()],
        booked: parseInt(booked),
        available: Math.max(0, trip.total_seats - parseInt(booked)),
        total_seats: trip.total_seats,
        effective_price: effectivePrice,
        is_surge: effectivePrice > trip.price,
      });
    }
    res.json({ trip, schedule });
  } catch(err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/bookings/mine
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT b.*,
             t.from_loc, t.to_loc, t.pickup_time, t.dropoff_time, t.date, t.price,
             t.status   AS trip_status,
             t.pickup_lat, t.pickup_lng, t.dropoff_lat, t.dropoff_lng,
             u.name     AS driver_name, u.car AS driver_car, u.plate AS driver_plate,
             c.status   AS checkin_status
      FROM bookings b
      JOIN trips  t ON t.id = b.trip_id
      JOIN users  u ON u.id = t.driver_id
      LEFT JOIN checkins c ON c.booking_id = b.id
      WHERE b.passenger_id = ?
      ORDER BY b.travel_date DESC, b.created_at DESC
    `, [req.user.id]);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/bookings/all-day-bookings — admin
router.get('/all-day-bookings', requireAuth, requireRole('admin'), async (req, res) => {
  const { date } = req.query;
  try {
    const whereDate = date ? 'AND b.travel_date = ?' : '';
    const params = date ? [date] : [];
    const [rows] = await db.query(`
      SELECT b.*, t.from_loc, t.to_loc, t.pickup_time, t.price,
             u.name AS passenger_name, u.phone AS passenger_phone,
             d.name AS driver_name
      FROM bookings b
      JOIN trips t ON t.id = b.trip_id
      JOIN users u ON u.id = b.passenger_id
      JOIN users d ON d.id = t.driver_id
      WHERE b.status != 'cancelled' ${whereDate}
      ORDER BY b.travel_date ASC, t.pickup_time ASC
    `, params);
    res.json(rows);
  } catch(err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/bookings — book for a specific travel_date
router.post('/', requireAuth, requireRole('passenger'), async (req, res) => {
  const { trip_id, seats, pickup_note, travel_date } = req.body;
  if (!trip_id || !seats) return res.status(400).json({ error: 'trip_id and seats required' });
  if (!travel_date) return res.status(400).json({ error: 'travel_date required (YYYY-MM-DD)' });
  if (seats < 1 || seats > 16) return res.status(400).json({ error: 'Invalid seat count' });

  const d = new Date(travel_date);
  if (d.getDay() === 5) return res.status(400).json({ error: 'No service on Fridays' });
  const today = new Date(); today.setHours(0,0,0,0);
  const travelD = new Date(travel_date); travelD.setHours(0,0,0,0);
  const diffDays = Math.round((travelD - today) / 86400000);
  if (diffDays < 0) return res.status(400).json({ error: 'Cannot book past dates' });
  if (diffDays > 7) return res.status(400).json({ error: 'Cannot book more than 7 days ahead' });

  try {
    const [tripRows] = await db.query(
      "SELECT * FROM trips WHERE id=? AND status IN ('upcoming','active','tendered','awarded','assigned')", [trip_id]
    );
    if (!tripRows.length) return res.status(404).json({ error: 'Trip not found or not available' });
    const trip = tripRows[0];

    const [existing] = await db.query(
      "SELECT id FROM bookings WHERE trip_id=? AND passenger_id=? AND travel_date=? AND status='confirmed'",
      [trip_id, req.user.id, travel_date]
    );
    if (existing.length) return res.status(409).json({ error: 'already_reserved' });

    const [[{ booked }]] = await db.query(
      "SELECT COALESCE(SUM(seats),0) AS booked FROM bookings WHERE trip_id=? AND travel_date=? AND status='confirmed'",
      [trip_id, travel_date]
    );
    if (parseInt(booked) + seats > trip.total_seats) {
      return res.status(409).json({ error: `Not enough seats. ${trip.total_seats - parseInt(booked)} left on ${travel_date}.` });
    }

    const effectivePrice = await computePrice(trip.price, travel_date);
    const isSurge = effectivePrice > trip.price;
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const dayName = dayNames[new Date(travel_date).getDay()];

    const [result] = await db.query(
      'INSERT INTO bookings (trip_id, passenger_id, seats, pickup_note, travel_date, effective_price, is_surge) VALUES (?,?,?,?,?,?,?)',
      [trip_id, req.user.id, seats, pickup_note || null, travel_date, effectivePrice, isSurge ? 1 : 0]
    );
    const bookingId = result.insertId;
    await db.query('INSERT INTO checkins (booking_id) VALUES (?)', [bookingId]);

    await db.query('INSERT INTO notifications (user_id, message) VALUES (?,?)',
      [req.user.id, `Booking confirmed for ${dayName} ${travel_date}: ${trip.from_loc} → ${trip.to_loc}${isSurge ? ` (surge +${effectivePrice - trip.price} EGP)` : ''}`]);
    await db.query('INSERT INTO notifications (user_id, message) VALUES (?,?)',
      [trip.driver_id, `New booking: ${seats} seat(s) on ${dayName} ${travel_date} — ${trip.from_loc} → ${trip.to_loc}`]);

    const [booking] = await db.query(`
      SELECT b.*, t.from_loc, t.to_loc, t.pickup_time, t.date, t.price,
             u.name AS driver_name, u.car AS driver_car, u.plate AS driver_plate
      FROM bookings b JOIN trips t ON t.id=b.trip_id JOIN users u ON u.id=t.driver_id
      WHERE b.id = ?
    `, [bookingId]);

    const io = getIo();
    if (io) {
      const [[{ newBooked }]] = await db.query(
        "SELECT COALESCE(SUM(seats),0) AS newBooked FROM bookings WHERE trip_id=? AND travel_date=? AND status='confirmed'",
        [trip_id, travel_date]
      );
      io.to('admin').emit('booking:updated', { tripId: trip_id, travelDate: travel_date, bookedSeats: newBooked });
      io.to(`trip:${trip_id}`).emit('booking:updated', { tripId: trip_id, travelDate: travel_date, bookedSeats: newBooked });
    }
    res.status(201).json(booking[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
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
    const io = getIo();
    if (io) {
      const [[{ newBooked }]] = await db.query(
        "SELECT COALESCE(SUM(seats),0) AS newBooked FROM bookings WHERE trip_id=? AND travel_date=? AND status='confirmed'",
        [booking.trip_id, booking.travel_date]
      );
      io.to('admin').emit('booking:updated', { tripId: booking.trip_id, travelDate: booking.travel_date, bookedSeats: newBooked });
    }
    res.json({ message: 'Booking cancelled' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/bookings/trip/:tripId
router.get('/trip/:tripId', requireAuth, async (req, res) => {
  const { date } = req.query;
  try {
    const whereDate = date ? 'AND b.travel_date = ?' : '';
    const params = date ? [req.params.tripId, date] : [req.params.tripId];
    const [rows] = await db.query(`
      SELECT b.*, u.name AS passenger_name, u.phone AS passenger_phone, c.status AS checkin_status
      FROM bookings b JOIN users u ON u.id=b.passenger_id
      LEFT JOIN checkins c ON c.booking_id=b.id
      WHERE b.trip_id=? AND b.status != 'cancelled' ${whereDate}
      ORDER BY b.travel_date ASC
    `, params);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
