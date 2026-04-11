const router  = require('express').Router();
const bcrypt  = require('bcrypt');
const db      = require('../db');
const { signToken, requireAuth } = require('../auth');

// In-memory OTP store (replace with Redis/Twilio in production)
const otpStore = {};

// POST /api/auth/send-otp
router.post('/send-otp', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone required' });
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[phone] = { otp, expires: Date.now() + 5 * 60 * 1000 };
  console.log(`📱  OTP for ${phone}: ${otp}`);   // In prod: send via Twilio
  res.json({ message: 'OTP sent', dev_otp: otp }); // dev_otp visible in response for demo
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, phone, password, role, car, plate, otp } = req.body;
  if (!name || !phone || !password || !role) {
    return res.status(400).json({ error: 'name, phone, password and role are required' });
  }

  // Verify OTP
  const record = otpStore[phone];
  if (!record || record.otp !== otp || Date.now() > record.expires) {
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  }
  delete otpStore[phone];

  try {
    const [existing] = await db.query('SELECT id FROM users WHERE phone=?', [phone]);
    if (existing.length) return res.status(409).json({ error: 'Phone already registered' });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (name,phone,password,role,car,plate) VALUES (?,?,?,?,?,?)',
      [name, phone, hash, role, car || null, plate || null]
    );
    const userId = result.insertId;
    const token  = signToken({ id: userId, role, name });

    // Notify admin of new driver registration
    if (role === 'driver') {
      await db.query(
        'INSERT INTO notifications (user_id, message) SELECT id, ? FROM users WHERE role="admin"',
        [`New driver registered: ${name}`]
      );
    }

    res.status(201).json({ token, user: { id: userId, name, phone, role, car, plate } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.status(400).json({ error: 'Phone and password required' });
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE phone=?', [phone]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    const token = signToken({ id: user.id, role: user.role, name: user.name });
    res.json({ token, user: { id: user.id, name: user.name, phone: user.phone, role: user.role, car: user.car, plate: user.plate } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  const [rows] = await db.query('SELECT id,name,phone,role,car,plate,created_at FROM users WHERE id=?', [req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
});

module.exports = router;
