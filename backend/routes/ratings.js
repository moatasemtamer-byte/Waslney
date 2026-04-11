const router = require('express').Router();
const db     = require('../db');
const { requireAuth, requireRole } = require('../auth');

// POST /api/ratings
router.post('/', requireAuth, requireRole('passenger'), async (req, res) => {
  const { trip_id, stars, comment } = req.body;
  if (!trip_id || !stars) return res.status(400).json({ error: 'trip_id and stars required' });
  if (stars < 1 || stars > 5) return res.status(400).json({ error: 'Stars must be 1–5' });
  try {
    const [tripRows] = await db.query('SELECT * FROM trips WHERE id=?', [trip_id]);
    if (!tripRows.length) return res.status(404).json({ error: 'Trip not found' });
    const trip = tripRows[0];

    // Check passenger was on this trip
    const [bRows] = await db.query(
      "SELECT * FROM bookings WHERE trip_id=? AND passenger_id=? AND status='completed'",
      [trip_id, req.user.id]
    );
    if (!bRows.length) return res.status(403).json({ error: 'You were not on this trip' });
    if (bRows[0].rated) return res.status(409).json({ error: 'Already rated' });

    await db.query(
      'INSERT INTO ratings (trip_id,passenger_id,driver_id,stars,comment) VALUES (?,?,?,?,?)',
      [trip_id, req.user.id, trip.driver_id, stars, comment || null]
    );
    await db.query('UPDATE bookings SET rated=1 WHERE trip_id=? AND passenger_id=?', [trip_id, req.user.id]);
    res.status(201).json({ message: 'Rating submitted' });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/ratings/driver/:driverId
router.get('/driver/:driverId', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT r.*, u.name AS passenger_name, t.from_loc, t.to_loc, t.date
      FROM ratings r
      JOIN users u ON u.id=r.passenger_id
      JOIN trips t ON t.id=r.trip_id
      WHERE r.driver_id=?
      ORDER BY r.created_at DESC
    `, [req.params.driverId]);
    const avg = rows.length ? (rows.reduce((s,r)=>s+r.stars,0)/rows.length).toFixed(1) : null;
    res.json({ ratings: rows, average: avg, count: rows.length });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
