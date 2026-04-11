// routes/checkins.js
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
    res.json({ message: 'Checkin updated', status });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
