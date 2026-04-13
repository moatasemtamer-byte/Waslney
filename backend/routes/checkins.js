const router = require('express').Router();
const db     = require('../db');
const { requireAuth, requireRole } = require('../auth');

// POST /api/checkins/stop-arrived
router.post('/stop-arrived', requireAuth, requireRole('driver'), async (req, res) => {
  const { trip_id, stop_index } = req.body;
  if (trip_id == null || stop_index == null)
    return res.status(400).json({ error: 'trip_id and stop_index required' });
  try {
    // Use a separate table to track arrived stops — avoids ALTER TABLE issues entirely
    await db.query(`
      CREATE TABLE IF NOT EXISTS stop_arrivals (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        trip_id    INT NOT NULL,
        stop_order INT NOT NULL,
        arrived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_stop (trip_id, stop_order)
      )
    `);

    await db.query(
      'INSERT INTO stop_arrivals (trip_id, stop_order) VALUES (?,?) ON DUPLICATE KEY UPDATE arrived_at=NOW()',
      [trip_id, stop_index]
    );

    // Notify all confirmed passengers on this trip
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
        [b.passenger_id, `🚐 Driver has arrived at: ${stopLabel}. Please be ready!`]);
    }

    res.json({ ok: true, notified: bookings.length });
  } catch (err) {
    console.error('stop-arrived error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/checkins/:bookingId
router.put('/:bookingId', requireAuth, requireRole('driver'), async (req, res) => {
  const { status } = req.body;
  const allowed = ['pending','picked','noshow','dropped'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    const [existing] = await db.query('SELECT id FROM checkins WHERE booking_id=?', [req.params.bookingId]);
    if (existing.length) {
      await db.query('UPDATE checkins SET status=? WHERE booking_id=?', [status, req.params.bookingId]);
    } else {
      await db.query('INSERT INTO checkins (booking_id, status) VALUES (?,?)', [req.params.bookingId, status]);
    }

    const [bRows] = await db.query(
      'SELECT b.*, t.from_loc, t.to_loc, t.dropoff_lat, t.dropoff_lng FROM bookings b JOIN trips t ON t.id=b.trip_id WHERE b.id=?',
      [req.params.bookingId]
    );
    if (!bRows.length) return res.json({ message: 'Checkin updated', status });
    const booking = bRows[0];

    if (status === 'picked') {
      const [dropoffStop] = await db.query(
        "SELECT * FROM trip_stops WHERE trip_id=? AND type='dropoff' ORDER BY stop_order ASC LIMIT 1",
        [booking.trip_id]
      );
      const dropoffLabel = dropoffStop[0]?.label || booking.to_loc || 'your drop-off';
      await db.query('INSERT INTO notifications (user_id,message) VALUES (?,?)',
        [booking.passenger_id, `✅ You've been picked up! Heading to ${dropoffLabel}. Open app for live navigation.`]);
    }

    if (status === 'noshow') {
      await db.query("UPDATE bookings SET status='cancelled' WHERE id=?", [req.params.bookingId]);
      await db.query('INSERT INTO notifications (user_id,message) VALUES (?,?)',
        [booking.passenger_id, `❌ Your trip was cancelled — marked as no-show for ${booking.from_loc} → ${booking.to_loc}.`]);
    }

    if (status === 'dropped') {
      await db.query('INSERT INTO notifications (user_id,message) VALUES (?,?)',
        [booking.passenger_id, `🏁 You've been dropped off! Please rate your driver.`]);
    }

    res.json({ message: 'Checkin updated', status });
  } catch (err) {
    console.error('checkin update error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
