const router = require('express').Router();
const db     = require('../db');
const { requireAuth } = require('../auth');

// GET /api/location/trip/:tripId  — get driver's last known position for a trip
router.get('/trip/:tripId', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT dl.lat, dl.lng, dl.updated_at, u.name AS driver_name
      FROM driver_locations dl
      JOIN trips t ON t.id = dl.trip_id
      JOIN users  u ON u.id = dl.driver_id
      WHERE dl.trip_id=?
    `, [req.params.tripId]);
    if (!rows.length) return res.status(404).json({ error: 'No location data yet' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/location/all  — admin: all active driver locations
router.get('/all', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT dl.lat, dl.lng, dl.updated_at, dl.trip_id,
             u.name AS driver_name, u.plate,
             t.from_loc, t.to_loc, t.status AS trip_status
      FROM driver_locations dl
      JOIN users u ON u.id = dl.driver_id
      LEFT JOIN trips t ON t.id = dl.trip_id
      WHERE t.status IN ('active','upcoming') OR dl.trip_id IS NULL
    `);
    res.json(rows);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
