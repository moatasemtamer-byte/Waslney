const router  = require('express').Router();
const bcrypt  = require('bcrypt');
const db      = require('../db');
const { signToken, requireAuth, requireRole } = require('../auth');

const otpStore = {};

// POST /api/auth/send-otp
router.post('/send-otp', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone required' });
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[phone] = { otp, expires: Date.now() + 5 * 60 * 1000 };
  console.log(`📱  OTP for ${phone}: ${otp}`);
  res.json({ message: 'OTP sent', dev_otp: otp });
});

// POST /api/auth/register
// Drivers: requires profile_photo + 3 document photos (base64)
// Driver accounts start as pending_review — admin must approve before login
router.post('/register', async (req, res) => {
  const {
    name, phone, password, role, car, plate, otp,
    profile_photo, car_license_photo, driver_license_photo, criminal_record_photo
  } = req.body;

  if (!name || !phone || !password || !role)
    return res.status(400).json({ error: 'name, phone, password and role are required' });

  if (role === 'driver') {
    if (!car || !plate)
      return res.status(400).json({ error: 'Car model and plate are required for drivers' });
    if (!profile_photo || !car_license_photo || !driver_license_photo || !criminal_record_photo)
      return res.status(400).json({ error: 'All photos are required: profile, car license, driver license, criminal record' });
  }

  const record = otpStore[phone];
  if (!record || record.otp !== otp || Date.now() > record.expires)
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  delete otpStore[phone];

  try {
    const [existing] = await db.query('SELECT id FROM users WHERE phone=?', [phone]);
    if (existing.length) return res.status(409).json({ error: 'Phone already registered' });

    const hash = await bcrypt.hash(password, 10);
    const accountStatus = role === 'driver' ? 'pending_review' : 'active';

    // Insert user — profile_photo & account_status columns added via migration
    const [result] = await db.query(
      'INSERT INTO users (name,phone,password,role,car,plate,account_status,profile_photo) VALUES (?,?,?,?,?,?,?,?)',
      [name, phone, hash, role, car||null, plate||null, accountStatus, profile_photo||null]
    );
    const userId = result.insertId;

    if (role === 'driver') {
      // Save documents
      await db.query(
        'INSERT INTO driver_documents(user_id,car_license_photo,driver_license_photo,criminal_record_photo) VALUES(?,?,?,?)',
        [userId, car_license_photo, driver_license_photo, criminal_record_photo]
      );
      // Notify all admins
      await db.query(
        'INSERT INTO notifications(user_id,message) SELECT id,? FROM users WHERE role="admin"',
        [`🚗 New driver pending review: ${name} — ${phone}`]
      );
    }

    const token = signToken({ id: userId, role, name });
    res.status(201).json({
      token,
      user: { id: userId, name, phone, role, car, plate, account_status: accountStatus }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login — blocks pending/rejected drivers
router.post('/login', async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.status(400).json({ error: 'Phone and password required' });
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE phone=?', [phone]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const status = user.account_status || 'active';
    if (status === 'pending_review')
      return res.status(403).json({ error: 'pending_review', message: 'Your account is under review. You\'ll be notified once approved.' });
    if (status === 'rejected')
      return res.status(403).json({ error: 'rejected', message: user.rejection_note || 'Your account was not approved. Contact support.' });

    const token = signToken({ id: user.id, role: user.role, name: user.name });
    res.json({ token, user: { id: user.id, name: user.name, phone: user.phone, role: user.role, car: user.car, plate: user.plate, account_status: status } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  const [rows] = await db.query('SELECT id,name,phone,role,car,plate,account_status,created_at FROM users WHERE id=?', [req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
});

// ── ADMIN: Driver Review ───────────────────────────────────────────────────

// GET /api/auth/admin/pending-drivers
router.get('/admin/pending-drivers', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT u.id, u.name, u.phone, u.car, u.plate, u.created_at,
             u.account_status, u.profile_photo, u.rejection_note,
             d.car_license_photo, d.driver_license_photo, d.criminal_record_photo, d.submitted_at
      FROM users u
      LEFT JOIN driver_documents d ON d.user_id = u.id
      WHERE u.role='driver' AND u.account_status IN ('pending_review','rejected')
      ORDER BY u.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/admin/review-driver/:id  { action: 'approve'|'reject', rejection_note? }
router.post('/admin/review-driver/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { action, rejection_note } = req.body;
  if (!['approve','reject'].includes(action))
    return res.status(400).json({ error: 'action must be approve or reject' });
  try {
    const [[driver]] = await db.query('SELECT * FROM users WHERE id=? AND role="driver"', [req.params.id]);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });

    const newStatus = action === 'approve' ? 'active' : 'rejected';
    await db.query('UPDATE users SET account_status=?, rejection_note=? WHERE id=?',
      [newStatus, rejection_note||null, req.params.id]);
    await db.query('UPDATE driver_documents SET reviewed_at=NOW(), reviewed_by=? WHERE user_id=?',
      [req.user.id, req.params.id]);

    const msg = action === 'approve'
      ? '🎉 Your driver account has been approved! You can now log in and start driving.'
      : `❌ Your driver account was not approved. ${rejection_note || 'Please contact support.'}`;
    await db.query('INSERT INTO notifications(user_id,message) VALUES(?,?)', [req.params.id, msg]);

    res.json({ ok: true, status: newStatus });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
