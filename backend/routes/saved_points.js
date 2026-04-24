const router = require('express').Router();
const db     = require('../db');
const { requireAuth, requireRole } = require('../auth');

// GET /api/saved-points — all logged-in users can read
router.get('/', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM saved_points ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/saved-points — admin only
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, type = 'both', lat, lng } = req.body;
  if (!name || lat == null || lng == null)
    return res.status(400).json({ error: 'name, lat and lng are required' });
  try {
    const [result] = await db.query(
      'INSERT INTO saved_points (name, type, lat, lng) VALUES (?, ?, ?, ?)',
      [name.trim(), type, parseFloat(lat), parseFloat(lng)]
    );
    const [rows] = await db.query('SELECT * FROM saved_points WHERE id=?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/saved-points/:id — admin only
router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, type, lat, lng } = req.body;
  try {
    await db.query(
      'UPDATE saved_points SET name=?, type=?, lat=?, lng=? WHERE id=?',
      [name, type, parseFloat(lat), parseFloat(lng), req.params.id]
    );
    const [rows] = await db.query('SELECT * FROM saved_points WHERE id=?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/saved-points/:id — admin only
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await db.query('DELETE FROM saved_points WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
