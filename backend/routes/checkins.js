const router = require('express').Router();
const db     = require('../db');
const { requireAuth, requireRole } = require('../auth');

// PUT /api/checkins/:bookingId
router.put('/:bookingId', requireAuth, requireRole('driver'), async (req, res) => {
  const { status } = req.body;
  const allowed = ['pending','picked','noshow','dropped'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    await db.query('UPDATE checkins SET status=? WHERE booking_id=?', [status, req.params.bookingId]);

    // Get booking + passenger info
    const [bRows] = await db.query(
      'SELECT b.*, t.from_loc, t.to_loc FROM bookings b JOIN trips t ON t.id=b.trip_id WHERE b.id=?',
      [req.params.bookingId]
    );
    if (!bRows.length) return res.json({ message: 'Checkin updated', status });
    const booking = bRows[0];

    if (status === 'picked') {
      // Notify passenger: trip started, navigate to dropoff
      await db.query('INSERT INTO notifications (user_id,message) VALUES (?,?)',
        [booking.passenger_id, `✅ You've been picked up! Driver is now heading to your drop-off point.`]);
    }

    if (status === 'noshow') {
      // Cancel booking and notify
      await db.query("UPDATE bookings SET status='cancelled' WHERE id=?", [req.params.bookingId]);
      await db.query('INSERT INTO notifications (user_id,message) VALUES (?,?)',
        [booking.passenger_id, `❌ Your trip was cancelled — you were marked as no-show for ${booking.from_loc} → ${booking.to_loc}.`]);
    }

    res.json({ message: 'Checkin updated', status });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/checkins/stop-arrived — driver marks a pickup stop as arrived
router.post('/stop-arrived', requireAuth, requireRole('driver'), async (req, res) => {
  const { trip_id, stop_index } = req.body;
  if (trip_id == null || stop_index == null)
    return res.status(400).json({ error: 'trip_id and stop_index required' });
  try {
    // Mark stop as arrived
    await db.query(
      'UPDATE trip_stops SET arrived=1 WHERE trip_id=? AND stop_order=?',
      [trip_id, stop_index]
    );

    // Get all passengers whose pickup stop matches this stop
    // We notify all confirmed passengers for this trip (driver will checkin individually)
    const [bookings] = await db.query(
      "SELECT b.passenger_id FROM bookings b WHERE b.trip_id=? AND b.status='confirmed'",
      [trip_id]
    );

    const [stopRows] = await db.query(
      'SELECT * FROM trip_stops WHERE trip_id=? AND stop_order=?',
      [trip_id, stop_index]
    );
    const stopLabel = stopRows[0]?.label || `Stop ${stop_index + 1}`;

    for (const b of bookings) {
      await db.query('INSERT INTO notifications (user_id,message) VALUES (?,?)',
        [b.passenger_id, `🚐 Driver has arrived at pickup point: ${stopLabel}. Please be ready!`]);
    }

    res.json({ message: 'Stop marked as arrived', notified: bookings.length });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
