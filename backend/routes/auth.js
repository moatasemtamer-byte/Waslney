// backend/routes/auth.js
require('dotenv').config();
const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const db         = require('../db');
const { requireAuth } = require('../auth');

const router     = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'waslney_secret_change_me';

// ── Email transporter (Hostinger SMTP — support@waslney.com) ─────────────────
const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true,                           // SSL on port 465
  auth: {
    user: process.env.MAIL_USER,          // support@waslney.com
    pass: process.env.MAIL_PASS,          // your Hostinger email password
  },
});

// In-memory OTP store (fine for single-instance server)
const otpStore = new Map(); // email -> { code, expires }

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
}

// ── POST /api/auth/send-otp ───────────────────────────────────────────────────
router.post('/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const code    = String(Math.floor(100000 + Math.random() * 900000));
  const expires = Date.now() + 10 * 60 * 1000; // 10 min
  otpStore.set(email, { code, expires });

  try {
    await transporter.sendMail({
      from: `"Waslney" <${process.env.MAIL_USER}>`,
      to: email,
      subject: 'Your Waslney verification code',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#0d0d0d;border-radius:16px;color:#fff">
          <h2 style="color:#fbbf24;margin-bottom:8px">Verify your email</h2>
          <p style="color:#aaa;margin-bottom:24px">Use the code below to complete your Waslney registration. It expires in 10 minutes.</p>
          <div style="letter-spacing:12px;font-size:36px;font-weight:800;text-align:center;padding:20px;background:#1a1a1a;border-radius:12px;color:#fff;margin-bottom:24px">
            ${code}
          </div>
          <p style="color:#555;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });

    console.log(`✉️  OTP sent to ${email}`);
    res.json({ ok: true });

  } catch (err) {
    console.error('Mail send error:', err);
    res.status(500).json({ error: 'Failed to send verification email. Check MAIL_USER / MAIL_PASS in .env' });
  }
});

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const {
    name, phone, email, password, role, otp,
    car, plate,
    profile_photo,
    car_license_photo,
    driver_license_photo,
    criminal_record_photo,
  } = req.body;

  if (!name || !phone || !email || !password || !role) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Verify OTP against email
  const stored = otpStore.get(email);
  if (!stored || stored.code !== String(otp) || Date.now() > stored.expires) {
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  }
  otpStore.delete(email);

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
      `INSERT INTO users (name, phone, email, password, role, car, plate, profile_photo, account_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, phone, email || null, hash, role, car || null, plate || null, profile_photo || null, account_status]
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
      `SELECT id, name, phone, email, role, car, plate, account_status, created_at
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
      `SELECT id, name, phone, email, role, car, plate, account_status, created_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ── POST /api/auth/verify-reset-otp ──────────────────────────────────────────
router.post('/verify-reset-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required' });

  const stored = otpStore.get(email);
  if (!stored || stored.code !== String(otp) || Date.now() > stored.expires) {
    return res.status(400).json({ error: 'Invalid or expired code' });
  }
  // Don't delete — keep it for the reset-password step
  res.json({ ok: true });
});

// ── POST /api/auth/reset-password ─────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { email, otp, password } = req.body;
  if (!email || !otp || !password) return res.status(400).json({ error: 'Missing fields' });

  // Verify OTP one final time
  const stored = otpStore.get(email);
  if (!stored || stored.code !== String(otp) || Date.now() > stored.expires) {
    return res.status(400).json({ error: 'Invalid or expired code' });
  }
  otpStore.delete(email);

  // Check user exists
  const [[user]] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
  if (!user) return res.status(404).json({ error: 'No account found with this email' });

  try {
    const hash = await bcrypt.hash(password, 10);
    await db.query('UPDATE users SET password = ? WHERE email = ?', [hash, email]);
    res.json({ ok: true });
  } catch (e) {
    console.error('Reset password error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/auth/admin-create-user ─────────────────────────────────────────
// Admin-only endpoint: creates any user type with no email verification
router.post('/admin-create-user', requireAuth, async (req, res) => {
  // Only admins may call this
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const {
    name, phone, email, password, role,
    car, plate,
    profile_photo,
    car_license_photo,
    driver_license_photo,
    criminal_record_photo,
  } = req.body;

  if (!name || !phone || !password || !role) {
    return res.status(400).json({ error: 'Missing required fields (name, phone, password, role)' });
  }

  if (role === 'driver') {
    if (!car || !plate) return res.status(400).json({ error: 'Car model and plate required for drivers' });
  }

  // Check phone not already taken
  const [[existing]] = await db.query('SELECT id FROM users WHERE phone = ?', [phone]);
  if (existing) return res.status(400).json({ error: 'Phone already registered' });

  try {
    const hash = await bcrypt.hash(password, 10);
    // Admin-created accounts are active immediately (even drivers)
    const account_status = 'active';

    const [result] = await db.query(
      `INSERT INTO users (name, phone, email, password, role, car, plate, profile_photo, account_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, phone, email || null, hash, role, car || null, plate || null, profile_photo || null, account_status]
    );
    const userId = result.insertId;

    // Save driver documents if provided
    if (role === 'driver' && (car_license_photo || driver_license_photo || criminal_record_photo)) {
      await db.query(
        `INSERT INTO driver_documents
           (user_id, car_license_photo, driver_license_photo, criminal_record_photo)
         VALUES (?, ?, ?, ?)`,
        [userId, car_license_photo || null, driver_license_photo || null, criminal_record_photo || null]
      );
    }

    const [[user]] = await db.query(
      `SELECT id, name, phone, email, role, car, plate, account_status, created_at
       FROM users WHERE id = ?`,
      [userId]
    );

    res.json({ ok: true, user });
  } catch (e) {
    console.error('Admin create-user error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
