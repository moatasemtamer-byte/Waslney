// backend/routes/auth.js
require('dotenv').config();
const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const db      = require('../db');
const { requireAuth } = require('../auth');

const router     = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'waslney_secret_change_me';

// In-memory OTP store (fine for single Railway instance)
const otpStore = new Map(); // phone -> { code, expires }

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
}

// ── POST /api/auth/send-otp ───────────────────────────────────────────────────
router.post('/send-otp', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone required' });

  const code    = String(Math.floor(100000 + Math.random() * 900000));
  const expires = Date.now() + 10 * 60 * 1000; // 10 min
  otpStore.set(phone, { code, expires });

  console.log(`📱 OTP for ${phone}: ${code}`);
  // TODO: send via SMS in production
  res.json({ ok: true, dev_otp: code });
});

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const {
    name, phone, password, role, otp,
    car, plate,
    profile_photo,
    car_license_photo,
    driver_license_photo,
    criminal_record_photo,
  } = req.body;

  if (!name || !phone || !password || !role) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Verify OTP
  const stored = otpStore.get(phone);
  if (!stored || stored.code !== String(otp) || Date.now() > stored.expires) {
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  }
  otpStore.delete(phone);

  // Check phone not already taken
  const [[existing]] = await db.query('SELECT id FROM users WHERE phone = ?', [phone]);
  if (existing) return res.status(400).json({ error: 'Phone already registered' });

  // Driver: validate docs
  if (role === 'driver') {
    if (!car || !plate) return res.status(400).json({ error: 'Car model and plate required' });
    if (!car_license_photo || !driver_license_photo || !criminal_record_photo) {
      return res.status(400).json({ error: 'All 3 document photos are required' });
    }
  }

  try {
    const hash           = await bcrypt.hash(password, 10);
    const account_status = role === 'driver' ? 'pending_review' : 'active';

    const [result] = await db.query(
      `INSERT INTO users (name, phone, password, role, car, plate, profile_photo, account_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, phone, hash, role, car || null, plate || null, profile_photo || null, account_status]
    );
    const userId = result.insertId;

    // Save driver documents
    if (role === 'driver') {
      await db.query(
        `INSERT INTO driver_documents
           (user_id, car_license_photo, driver_license_photo, criminal_record_photo)
         VALUES (?, ?, ?, ?)`,
        [userId, car_license_photo, driver_license_photo, criminal_record_photo]
      );
    }

    const [[user]] = await db.query(
      `SELECT id, name, phone, role, car, plate, account_status, created_at
       FROM users WHERE id = ?`,
      [userId]
    );

    // Drivers go to pending screen — no token issued yet
    if (role === 'driver') {
      return res.json({ ok: true, user });
    }

    const token = signToken(user);
    res.json({ ok: true, user, token });

  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ error: 'Phone and password required' });
  }

  try {
    const [[user]] = await db.query('SELECT * FROM users WHERE phone = ?', [phone]);
    if (!user) return res.status(401).json({ error: 'Wrong credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Wrong credentials' });

    // Block pending / rejected drivers
    if (user.account_status === 'pending_review') {
      return res.status(403).json({ error: 'pending_review' });
    }
    if (user.account_status === 'rejected') {
      return res.status(403).json({ error: 'rejected', detail: user.rejection_note || '' });
    }

    const token = signToken(user);
    const { password: _pw, ...safeUser } = user;
    res.json({ ok: true, user: safeUser, token });

  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const [[user]] = await db.query(
      `SELECT id, name, phone, role, car, plate, account_status, created_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
