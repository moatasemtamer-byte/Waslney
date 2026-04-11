const router = require('express').Router();
const db     = require('../db');
const { requireAuth, requireRole } = require('../auth');

// GET /api/users  — admin gets all users
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id,name,phone,role,car,plate,created_at FROM users ORDER BY role,name'
    );
    res.json(rows);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/users/drivers  — admin gets drivers with stats
router.get('/drivers', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT u.id, u.name, u.phone, u.car, u.plate, u.created_at,
             COALESCE(AVG(r.stars),0) AS avg_rating,
             COUNT(DISTINCT r.id) AS rating_count,
             COUNT(DISTINCT t.id) AS total_trips,
             COUNT(DISTINCT CASE WHEN t.status='completed' THEN t.id END) AS completed_trips
      FROM users u
      LEFT JOIN ratings r ON r.driver_id=u.id
      LEFT JOIN trips   t ON t.driver_id=u.id
      WHERE u.role='driver'
      GROUP BY u.id
      ORDER BY u.name
    `);
    res.json(rows);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
