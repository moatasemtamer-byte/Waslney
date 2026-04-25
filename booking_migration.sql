-- ═══════════════════════════════════════════════════════════════════════════
-- WASLNEY — Booking System Migration
-- Run this on your MySQL/MariaDB database ONCE before deploying the update
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Add new columns to bookings table (daily booking support)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS travel_date     DATE           NULL            AFTER pickup_note,
  ADD COLUMN IF NOT EXISTS effective_price DECIMAL(10,2)  NULL            AFTER travel_date,
  ADD COLUMN IF NOT EXISTS is_surge        TINYINT(1)     NOT NULL DEFAULT 0 AFTER effective_price;

-- 2. Back-fill travel_date for existing bookings (use the trip's date)
UPDATE bookings b
JOIN trips t ON t.id = b.trip_id
SET b.travel_date = DATE(t.date)
WHERE b.travel_date IS NULL;

-- 3. Back-fill effective_price for existing bookings (use the trip's base price)
UPDATE bookings b
JOIN trips t ON t.id = b.trip_id
SET b.effective_price = t.price
WHERE b.effective_price IS NULL;

-- 4. Create booking_settings table (admin-configurable round start & surge)
CREATE TABLE IF NOT EXISTS booking_settings (
  id                      INT            NOT NULL DEFAULT 1 PRIMARY KEY,
  booking_round_start_day TINYINT        NOT NULL DEFAULT 5,   -- 0=Sun 1=Mon … 5=Fri 6=Sat
  surge_percent           DECIMAL(5,2)   NOT NULL DEFAULT 10.00,
  surge_after_friday      TINYINT(1)     NOT NULL DEFAULT 1,
  updated_at              TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 5. Insert default settings (safe to run even if row already exists)
INSERT IGNORE INTO booking_settings (id, booking_round_start_day, surge_percent, surge_after_friday)
VALUES (1, 5, 10, 1);

-- ═══════════════════════════════════════════════════════════════════════════
-- Done! After running this, restart your Node server.
-- ═══════════════════════════════════════════════════════════════════════════
