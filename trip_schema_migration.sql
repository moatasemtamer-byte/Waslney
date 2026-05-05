-- ═══════════════════════════════════════════════════════
-- MIGRATION: Recurring trips + per-stop ETA offsets
-- Run this ONCE on your database
-- ═══════════════════════════════════════════════════════

-- 1. Add days_of_week to trips (JSON array, e.g. [1,2,3,4,6] = Mon-Thu,Sat)
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS days_of_week VARCHAR(30) DEFAULT '[1,2,3,4,6]'
  COMMENT 'JSON array of weekday numbers (0=Sun,1=Mon,...,6=Sat). Friday(5) always excluded.';

-- 2. Make total_seats very large by default (no hard cap — use dispatch for batching)
ALTER TABLE trips
  MODIFY COLUMN total_seats INT NOT NULL DEFAULT 9999;

-- 3. Add offset_minutes to trip_stops (minutes after trip departure for ETA at this stop)
ALTER TABLE trip_stops
  ADD COLUMN IF NOT EXISTS offset_minutes INT DEFAULT NULL
  COMMENT 'Minutes after trip departure time when bus arrives at this stop. NULL = unknown.';

-- 4. Make driver_id and date optional / backward-compat
ALTER TABLE trips
  MODIFY COLUMN date DATE NOT NULL DEFAULT (CURDATE());

-- 5. Back-fill days_of_week for existing trips that don't have it
UPDATE trips SET days_of_week = '[1,2,3,4,6]' WHERE days_of_week IS NULL OR days_of_week = '';

SELECT 'Migration complete ✅' AS status;
