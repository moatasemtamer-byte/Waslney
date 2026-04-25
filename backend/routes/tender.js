// backend/routes/tender.js
// Full tender / reverse-auction system for Waslney
const router = require('express').Router();
const db     = require('../db');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'waslney_secret_change_me';

function getIo() { try { return require('../server').io; } catch(_) { return null; } }

// ── Company auth middleware ───────────────────────────────
function companyAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.company = jwt.verify(token, JWT_SECRET);
    if (req.company.type !== 'company') return res.status(403).json({ error: 'Not a company account' });
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
}

// ──────────────────────────────────────────────────────────
// COMPANY AUTH
// ──────────────────────────────────────────────────────────

// POST /api/tender/company/register
router.post('/company/register', async (req, res) => {
  const { company_name, fleet_number, password, phone } = req.body;
  if (!company_name || !fleet_number || !password)
    return res.status(400).json({ error: 'company_name, fleet_number, password required' });
  try {
    const [ex] = await db.query('SELECT id FROM companies WHERE company_name=?', [company_name]);
    if (ex.length) return res.status(409).json({ error: 'Company name already exists' });
    const hash = await bcrypt.hash(password, 10);

    // Try insert with phone column; fall back without it if column doesn't exist yet
    let insertId;
    try {
      const [r] = await db.query(
        'INSERT INTO companies (company_name, fleet_number, password_hash, phone) VALUES (?,?,?,?)',
        [company_name.trim(), fleet_number.trim(), hash, phone || null]
      );
      insertId = r.insertId;
    } catch(colErr) {
      // phone column missing — insert without it then try to add column
      const [r] = await db.query(
        'INSERT INTO companies (company_name, fleet_number, password_hash) VALUES (?,?,?)',
        [company_name.trim(), fleet_number.trim(), hash]
      );
      insertId = r.insertId;
      // Best-effort: add the column for future requests
      try { await db.query(`ALTER TABLE companies ADD COLUMN phone VARCHAR(30) DEFAULT NULL`); } catch(_) {}
    }

    const token = jwt.sign({ id: insertId, company_name, type: 'company' }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, company: { id: insertId, company_name, fleet_number, phone: phone || null } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/tender/company/login
router.post('/company/login', async (req, res) => {
  const { company_name, password } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM companies WHERE company_name=?', [company_name]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: rows[0].id, company_name: rows[0].company_name, type: 'company' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, company: { id: rows[0].id, company_name: rows[0].company_name, fleet_number: rows[0].fleet_number, phone: rows[0].phone || null } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/tender/company/me
router.get('/company/me', companyAuth, async (req, res) => {
  const [rows] = await db.query('SELECT id, company_name, fleet_number, phone, created_at FROM companies WHERE id=?', [req.company.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// ──────────────────────────────────────────────────────────
// COMPANY DRIVERS & CARS
// ──────────────────────────────────────────────────────────

// GET /api/tender/company/drivers
router.get('/company/drivers', companyAuth, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM company_drivers WHERE company_id=? ORDER BY name ASC', [req.company.id]);
  res.json(rows);
});

// POST /api/tender/company/drivers
router.post('/company/drivers', companyAuth, async (req, res) => {
  const { name, phone, license_number } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const [r] = await db.query(
    'INSERT INTO company_drivers (company_id, name, phone, license_number) VALUES (?,?,?,?)',
    [req.company.id, name, phone || null, license_number || null]
  );
  const [rows] = await db.query('SELECT * FROM company_drivers WHERE id=?', [r.insertId]);
  res.status(201).json(rows[0]);
});

// DELETE /api/tender/company/drivers/:id
router.delete('/company/drivers/:id', companyAuth, async (req, res) => {
  await db.query('DELETE FROM company_drivers WHERE id=? AND company_id=?', [req.params.id, req.company.id]);
  res.json({ ok: true });
});

// GET /api/tender/company/cars
router.get('/company/cars', companyAuth, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM company_cars WHERE company_id=? ORDER BY plate ASC', [req.company.id]);
  res.json(rows);
});

// POST /api/tender/company/cars
router.post('/company/cars', companyAuth, async (req, res) => {
  const { plate, model, capacity } = req.body;
  if (!plate) return res.status(400).json({ error: 'plate required' });
  const [r] = await db.query(
    'INSERT INTO company_cars (company_id, plate, model, capacity) VALUES (?,?,?,?)',
    [req.company.id, plate, model || null, capacity || null]
  );
  const [rows] = await db.query('SELECT * FROM company_cars WHERE id=?', [r.insertId]);
  res.status(201).json(rows[0]);
});

// DELETE /api/tender/company/cars/:id
router.delete('/company/cars/:id', companyAuth, async (req, res) => {
  await db.query('DELETE FROM company_cars WHERE id=? AND company_id=?', [req.params.id, req.company.id]);
  res.json({ ok: true });
});

// ──────────────────────────────────────────────────────────
// TENDERS (admin creates, companies bid)
// ──────────────────────────────────────────────────────────
const { requireAuth, requireRole } = require('../auth');

// GET /api/tender/tenders — all open tenders (public for companies + admin)
router.get('/tenders', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT tn.*,
             t.from_loc, t.to_loc, t.date, t.pickup_time, t.total_seats,
             (SELECT MIN(b.amount) FROM bids b WHERE b.tender_id=tn.id) AS lowest_bid,
             (SELECT COUNT(*) FROM bids b WHERE b.tender_id=tn.id) AS bid_count
      FROM tenders tn
      LEFT JOIN trips t ON t.id = tn.trip_id
      ORDER BY tn.ends_at ASC
    `);
    res.json(rows);
  } catch(e) { console.error(e); res.status(500).json({ error:'Server error' }); }
});

// GET /api/tender/tenders/:id — single tender with bids (amounts visible, companies anonymous)
router.get('/tenders/:id', async (req, res) => {
  try {
    const [tenders] = await db.query(`
      SELECT tn.*, t.from_loc, t.to_loc, t.date, t.pickup_time, t.dropoff_time, t.total_seats, t.price
      FROM tenders tn LEFT JOIN trips t ON t.id=tn.trip_id
      WHERE tn.id=?
    `, [req.params.id]);
    if (!tenders.length) return res.status(404).json({ error: 'Not found' });

    // Return bids with amounts but no company identity (anonymous bidding)
    const [bids] = await db.query(`
      SELECT b.id, b.amount, b.created_at,
             ROW_NUMBER() OVER (ORDER BY b.amount ASC) AS rank_pos
      FROM bids b WHERE b.tender_id=?
      ORDER BY b.amount ASC
    `, [req.params.id]);

    // Include trip stops so company can see the route map
    const [stops] = await db.query(
      'SELECT * FROM trip_stops WHERE trip_id=? ORDER BY stop_order ASC',
      [tenders[0].trip_id]
    );

    res.json({ ...tenders[0], bids, stops });
  } catch(e) { console.error(e); res.status(500).json({ error:'Server error' }); }
});

// POST /api/tender/tenders — admin creates a tender for a trip
router.post('/tenders', requireAuth, requireRole('admin'), async (req, res) => {
  const { trip_id, duration_minutes = 60, description } = req.body;
  if (!trip_id) return res.status(400).json({ error: 'trip_id required' });
  const ends_at = new Date(Date.now() + duration_minutes * 60 * 1000);
  try {
    const [r] = await db.query(
      'INSERT INTO tenders (trip_id, ends_at, status, description) VALUES (?,?,?,?)',
      [trip_id, ends_at, 'open', description || null]
    );
    // Mark trip as tendered
    await db.query("UPDATE trips SET status='tendered' WHERE id=?", [trip_id]);
    const [rows] = await db.query('SELECT * FROM tenders WHERE id=?', [r.insertId]);
    const io = getIo();
    if (io) io.emit('tender:new', rows[0]);
    res.status(201).json(rows[0]);
  } catch(e) { console.error(e); res.status(500).json({ error:'Server error' }); }
});

// DELETE /api/tender/tenders/:id — admin cancels tender
router.delete('/tenders/:id', requireAuth, requireRole('admin'), async (req, res) => {
  await db.query("UPDATE tenders SET status='cancelled' WHERE id=?", [req.params.id]);
  const io = getIo();
  if (io) io.emit('tender:cancelled', { tender_id: req.params.id });
  res.json({ ok: true });
});

// ──────────────────────────────────────────────────────────
// BIDS
// ──────────────────────────────────────────────────────────

// POST /api/tender/tenders/:id/bid — company places a bid
router.post('/tenders/:id/bid', companyAuth, async (req, res) => {
  const { amount } = req.body;
  if (!amount || isNaN(amount)) return res.status(400).json({ error: 'amount required' });

  try {
    const [tenders] = await db.query("SELECT * FROM tenders WHERE id=? AND status='open'", [req.params.id]);
    if (!tenders.length) return res.status(400).json({ error: 'Tender not open or not found' });
    if (new Date(tenders[0].ends_at) < new Date()) return res.status(400).json({ error: 'Tender has ended' });

    // Upsert — each company can only have one bid, they can update it
    const [existing] = await db.query('SELECT id FROM bids WHERE tender_id=? AND company_id=?', [req.params.id, req.company.id]);
    if (existing.length) {
      await db.query('UPDATE bids SET amount=?, created_at=NOW() WHERE id=?', [parseFloat(amount), existing[0].id]);
    } else {
      await db.query('INSERT INTO bids (tender_id, company_id, amount) VALUES (?,?,?)', [req.params.id, req.company.id, parseFloat(amount)]);
    }

    // Fetch updated anonymous bid list
    const [bids] = await db.query(`
      SELECT id, amount, created_at, ROW_NUMBER() OVER (ORDER BY amount ASC) AS rank_pos
      FROM bids WHERE tender_id=? ORDER BY amount ASC
    `, [req.params.id]);

    const io = getIo();
    if (io) io.emit(`tender:${req.params.id}:bids`, bids);

    res.json({ ok: true, bids });
  } catch(e) { console.error(e); res.status(500).json({ error:'Server error' }); }
});

// ──────────────────────────────────────────────────────────
// CLOSE TENDER & AWARD (auto or manual)
// ──────────────────────────────────────────────────────────

// POST /api/tender/tenders/:id/close — admin manually closes and awards to lowest bidder
router.post('/tenders/:id/close', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const [tenders] = await db.query('SELECT * FROM tenders WHERE id=?', [req.params.id]);
    if (!tenders.length) return res.status(404).json({ error: 'Not found' });

    // Find lowest bid
    const [bids] = await db.query(
      'SELECT b.*, c.company_name, c.phone FROM bids b JOIN companies c ON c.id=b.company_id WHERE b.tender_id=? ORDER BY b.amount ASC LIMIT 1',
      [req.params.id]
    );
    if (!bids.length) return res.status(400).json({ error: 'No bids placed' });

    const winner = bids[0];

    // Calculate the 7-day assignment window starting today
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const fmt = d => d.toISOString().slice(0, 10);

    await db.query(
      "UPDATE tenders SET status='awarded', winner_company_id=?, awarded_amount=?, awarded_at=NOW() WHERE id=?",
      [winner.company_id, winner.amount, req.params.id]
    );
    await db.query("UPDATE trips SET status='awarded' WHERE id=?", [tenders[0].trip_id]);

    // Create the weekly assignment record
    const [waResult] = await db.query(
      'INSERT INTO trip_week_assignments (tender_id, trip_id, company_id, week_start, week_end) VALUES (?,?,?,?,?)',
      [req.params.id, tenders[0].trip_id, winner.company_id, fmt(weekStart), fmt(weekEnd)]
    );
    const weekAssignmentId = waResult.insertId;

    // Link it back onto the tender for convenience
    try {
      await db.query('UPDATE tenders SET week_assignment_id=? WHERE id=?', [weekAssignmentId, req.params.id]);
    } catch(_) {}

    const io = getIo();
    if (io) io.emit(`tender:${req.params.id}:awarded`, {
      company_id: winner.company_id, company_name: winner.company_name,
      amount: winner.amount, week_start: fmt(weekStart), week_end: fmt(weekEnd)
    });

    res.json({
      winner_company_id: winner.company_id, winner_company_name: winner.company_name,
      awarded_amount: winner.amount,
      week_assignment: { id: weekAssignmentId, week_start: fmt(weekStart), week_end: fmt(weekEnd) }
    });
  } catch(e) { console.error(e); res.status(500).json({ error:'Server error' }); }
});

// GET /api/tender/admin/live-bids — admin sees all tenders with full bid details (company names + contact)
router.get('/admin/live-bids', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const [tenders] = await db.query(`
      SELECT tn.*,
             t.from_loc, t.to_loc, t.date, t.pickup_time, t.total_seats,
             wc.company_name AS winner_company_name, wc.phone AS winner_phone, wc.fleet_number AS winner_fleet,
             wa.week_start, wa.week_end
      FROM tenders tn
      LEFT JOIN trips t ON t.id = tn.trip_id
      LEFT JOIN companies wc ON wc.id = tn.winner_company_id
      LEFT JOIN trip_week_assignments wa ON wa.tender_id = tn.id
      ORDER BY tn.ends_at DESC
    `);

    // For each tender, get bids with company info (revealed to admin)
    const result = await Promise.all(tenders.map(async (tn) => {
      const [bids] = await db.query(`
        SELECT b.id, b.amount, b.created_at,
               c.company_name, c.phone, c.fleet_number,
               ROW_NUMBER() OVER (ORDER BY b.amount ASC) AS rank_pos
        FROM bids b
        JOIN companies c ON c.id = b.company_id
        WHERE b.tender_id = ?
        ORDER BY b.amount ASC
      `, [tn.id]);
      return { ...tn, bids };
    }));

    res.json(result);
  } catch(e) { console.error(e); res.status(500).json({ error:'Server error' }); }
});

// ──────────────────────────────────────────────────────────
// ASSIGN DRIVER & CAR (winner company)
// ──────────────────────────────────────────────────────────

// GET /api/tender/won — tenders won by this company (with week assignment info)
router.get('/won', companyAuth, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const [rows] = await db.query(`
    SELECT tn.*,
           t.from_loc, t.to_loc, t.date, t.pickup_time, t.total_seats,
           tn.awarded_amount,
           wa.id AS week_assignment_id,
           wa.week_start, wa.week_end,
           CASE WHEN wa.week_end >= ? AND wa.week_start <= ? THEN 1 ELSE 0 END AS week_active,
           cd.name  AS assigned_driver_name,
           cc.plate AS assigned_car_plate
    FROM tenders tn
    LEFT JOIN trips t              ON t.id  = tn.trip_id
    LEFT JOIN trip_week_assignments wa ON wa.tender_id = tn.id
    LEFT JOIN company_drivers cd   ON cd.id = tn.assigned_driver_id
    LEFT JOIN company_cars    cc   ON cc.id = tn.assigned_car_id
    WHERE tn.winner_company_id=? AND tn.status='awarded'
    ORDER BY wa.week_start DESC, tn.awarded_at DESC
  `, [today, today, req.company.id]);
  res.json(rows);
});

// GET /api/tender/won/:weekAssignmentId/daily — get all daily assignments for a week
router.get('/won/:weekAssignmentId/daily', companyAuth, async (req, res) => {
  try {
    // Verify this week assignment belongs to this company
    const [wa] = await db.query(
      'SELECT * FROM trip_week_assignments WHERE id=? AND company_id=?',
      [req.params.weekAssignmentId, req.company.id]
    );
    if (!wa.length) return res.status(403).json({ error: 'Not your assignment' });

    const [rows] = await db.query(`
      SELECT da.*, cd.name AS driver_name, cd.phone AS driver_phone,
             cc.plate AS car_plate, cc.model AS car_model
      FROM trip_daily_assignments da
      LEFT JOIN company_drivers cd ON cd.id = da.driver_id
      LEFT JOIN company_cars    cc ON cc.id = da.car_id
      WHERE da.week_assignment_id=?
      ORDER BY da.assignment_date ASC
    `, [req.params.weekAssignmentId]);
    res.json({ week: wa[0], daily: rows });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/tender/won/:weekAssignmentId/daily — set or update driver/car for a specific date
router.post('/won/:weekAssignmentId/daily', companyAuth, async (req, res) => {
  const { driver_id, car_id, assignment_date } = req.body;
  if (!driver_id || !car_id || !assignment_date)
    return res.status(400).json({ error: 'driver_id, car_id, and assignment_date required' });

  try {
    // Verify this week assignment belongs to this company
    const [wa] = await db.query(
      'SELECT * FROM trip_week_assignments WHERE id=? AND company_id=?',
      [req.params.weekAssignmentId, req.company.id]
    );
    if (!wa.length) return res.status(403).json({ error: 'Not your assignment' });

    // Check the date is within the week window
    const d = new Date(assignment_date);
    const wStart = new Date(wa[0].week_start);
    const wEnd   = new Date(wa[0].week_end);
    wEnd.setHours(23, 59, 59);
    if (d < wStart || d > wEnd)
      return res.status(400).json({ error: `Date must be within ${wa[0].week_start} – ${wa[0].week_end}` });

    // Verify driver/car belong to company
    const [drivers] = await db.query('SELECT id,name FROM company_drivers WHERE id=? AND company_id=?', [driver_id, req.company.id]);
    const [cars]    = await db.query('SELECT id,plate,model FROM company_cars WHERE id=? AND company_id=?', [car_id, req.company.id]);
    if (!drivers.length || !cars.length) return res.status(403).json({ error: 'Driver or car not in your fleet' });

    // Upsert daily assignment
    await db.query(`
      INSERT INTO trip_daily_assignments (week_assignment_id, trip_id, company_id, assignment_date, driver_id, car_id)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE driver_id=VALUES(driver_id), car_id=VALUES(car_id), updated_at=NOW()
    `, [req.params.weekAssignmentId, wa[0].trip_id, req.company.id, assignment_date, driver_id, car_id]);

    // Also update the tenders table with today's assignment if it's for today
    const today = new Date().toISOString().slice(0, 10);
    if (assignment_date === today) {
      await db.query(
        'UPDATE tenders SET assigned_driver_id=?, assigned_car_id=? WHERE id=?',
        [driver_id, car_id, wa[0].tender_id]
      );
      await db.query(
        "UPDATE trips SET status='assigned', driver_car=? WHERE id=?",
        [cars[0].plate, wa[0].trip_id]
      );
    }

    const io = getIo();
    if (io) io.emit('tender:daily_assigned', {
      trip_id: wa[0].trip_id,
      assignment_date,
      driver_name: drivers[0].name,
      car_plate: cars[0].plate
    });

    res.json({
      ok: true,
      driver_name: drivers[0].name,
      car_plate: cars[0].plate,
      car_model: cars[0].model
    });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/tender/tenders/:id/re-tender — admin re-opens a trip for bidding after week ends
router.post('/tenders/:id/re-tender', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const [tenders] = await db.query('SELECT * FROM tenders WHERE id=?', [req.params.id]);
    if (!tenders.length) return res.status(404).json({ error: 'Not found' });

    // Check the week has ended
    const [wa] = await db.query('SELECT * FROM trip_week_assignments WHERE tender_id=?', [req.params.id]);
    if (wa.length) {
      const weekEnd = new Date(wa[0].week_end);
      weekEnd.setHours(23, 59, 59);
      if (new Date() <= weekEnd) {
        return res.status(400).json({
          error: `Week assignment is still active until ${wa[0].week_end}. Cannot re-tender yet.`
        });
      }
    }

    const { duration_minutes = 60, description } = req.body;
    const ends_at = new Date(Date.now() + duration_minutes * 60 * 1000);

    // Create a new tender for the same trip
    const [r] = await db.query(
      'INSERT INTO tenders (trip_id, ends_at, status, description) VALUES (?,?,?,?)',
      [tenders[0].trip_id, ends_at, 'open', description || null]
    );
    await db.query("UPDATE trips SET status='tendered' WHERE id=?", [tenders[0].trip_id]);
    const [newTender] = await db.query('SELECT * FROM tenders WHERE id=?', [r.insertId]);

    const io = getIo();
    if (io) io.emit('tender:new', newTender[0]);

    res.status(201).json(newTender[0]);
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/tender/trip/:tripId/current-assignment — used by passenger/trip view to show company+driver+car
router.get('/trip/:tripId/current-assignment', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    // Find an active week assignment for this trip
    const [wa] = await db.query(`
      SELECT wa.*, c.company_name, c.phone AS company_phone, c.fleet_number
      FROM trip_week_assignments wa
      JOIN companies c ON c.id = wa.company_id
      WHERE wa.trip_id=? AND wa.week_start <= ? AND wa.week_end >= ?
      ORDER BY wa.created_at DESC LIMIT 1
    `, [req.params.tripId, today, today]);

    if (!wa.length) return res.json({ assigned: false });

    // Find today's specific driver/car assignment
    const [daily] = await db.query(`
      SELECT da.*, cd.name AS driver_name, cd.phone AS driver_phone,
             cc.plate AS car_plate, cc.model AS car_model
      FROM trip_daily_assignments da
      LEFT JOIN company_drivers cd ON cd.id = da.driver_id
      LEFT JOIN company_cars    cc ON cc.id = da.car_id
      WHERE da.week_assignment_id=? AND da.assignment_date=?
    `, [wa[0].id, today]);

    res.json({
      assigned: true,
      company_name: wa[0].company_name,
      company_phone: wa[0].company_phone,
      fleet_number: wa[0].fleet_number,
      week_start: wa[0].week_start,
      week_end: wa[0].week_end,
      today_driver: daily.length ? {
        name: daily[0].driver_name,
        phone: daily[0].driver_phone,
        car_plate: daily[0].car_plate,
        car_model: daily[0].car_model,
      } : null,
    });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
