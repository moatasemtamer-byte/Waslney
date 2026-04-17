// backend/routes/users.js  — drop-in replacement / patch
const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ── Auth middleware (matches project convention from pool.js / auth.js) ───────
const { requireAuth, requireRole } = require('../auth');

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}

// ── GET /api/users  (existing — keep as-is) ───────────────────────────────────
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, name, phone, role, account_status, created_at FROM users ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/users/drivers  (existing — keep as-is) ──────────────────────────
router.get('/drivers', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, name, phone, car, plate, account_status, created_at
       FROM users WHERE role='driver' ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/users/pending-review  ───────────────────────────────────────────
// Returns all drivers whose account_status = 'pending_review', with their documents
router.get('/pending-review', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        u.id, u.name, u.phone, u.car, u.plate, u.profile_photo, u.created_at,
        d.car_license_photo, d.driver_license_photo, d.criminal_record_photo,
        d.submitted_at
      FROM users u
      JOIN driver_documents d ON d.user_id = u.id
      WHERE u.role = 'driver'
        AND u.account_status = 'pending_review'
      ORDER BY d.submitted_at ASC
    `);
    res.json({ drivers: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/users/:id/approve  ─────────────────────────────────────────────
router.post('/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const [[u]] = await db.query(
      `SELECT id, role FROM users WHERE id = ?`, [id]
    );
    if (!u) return res.status(404).json({ error: 'User not found' });
    if (u.role !== 'driver') return res.status(400).json({ error: 'Only drivers can be approved' });

    await db.query(
      `UPDATE users SET account_status='active', rejection_note=NULL WHERE id=?`, [id]
    );
    await db.query(
      `UPDATE driver_documents SET reviewed_at=NOW(), reviewed_by=? WHERE user_id=?`,
      [req.user.id, id]
    );

    // Optional: create an in-app notification for the driver
    try {
      await db.query(
        `INSERT INTO notifications (user_id, title, body) VALUES (?, ?, ?)`,
        [id, 'Account Approved ✅', 'Your documents have been reviewed and your account is now active. You can start accepting trips!']
      );
    } catch (_) { /* notifications table may not exist — safe to ignore */ }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/users/:id/reject  ──────────────────────────────────────────────
router.post('/:id/reject', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { note = '' } = req.body;
  try {
    const [[u]] = await db.query(
      `SELECT id, role FROM users WHERE id = ?`, [id]
    );
    if (!u) return res.status(404).json({ error: 'User not found' });

    await db.query(
      `UPDATE users SET account_status='rejected', rejection_note=? WHERE id=?`,
      [note, id]
    );
    await db.query(
      `UPDATE driver_documents SET reviewed_at=NOW(), reviewed_by=? WHERE user_id=?`,
      [req.user.id, id]
    );

    // Optional: create an in-app notification for the driver
    try {
      const body = note
        ? `Your account was not approved. Reason: ${note}`
        : 'Your account was not approved. Please contact support for more information.';
      await db.query(
        `INSERT INTO notifications (user_id, title, body) VALUES (?, ?, ?)`,
        [id, 'Account Not Approved ❌', body]
      );
    } catch (_) { /* safe to ignore */ }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

// ── GET /api/users/debug-review  (TEMPORARY — remove after debugging) ────────
// Returns raw counts to diagnose why review page is empty
router.get('/debug-review', requireAuth, async (req, res) => {
  try {
    const [[{ total_drivers }]] = await db.query(
      `SELECT COUNT(*) AS total_drivers FROM users WHERE role='driver'`
    );
    const [[{ pending }]] = await db.query(
      `SELECT COUNT(*) AS pending FROM users WHERE role='driver' AND account_status='pending_review'`
    );
    const [[{ has_docs }]] = await db.query(
      `SELECT COUNT(*) AS has_docs FROM driver_documents`
    );
    const [[{ col_exists }]] = await db.query(
      `SELECT COUNT(*) AS col_exists FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='account_status'`
    );
    const [sample] = await db.query(
      `SELECT id, name, role, account_status FROM users ORDER BY id DESC LIMIT 5`
    );
    res.json({
      your_role: req.user.role,
      your_id:   req.user.id,
      total_drivers,
      pending_review_count: pending,
      driver_documents_rows: has_docs,
      account_status_col_exists: col_exists === 1,
      recent_users: sample,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
