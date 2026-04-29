-- ═══════════════════════════════════════════════════════════════════════════
-- WASLNEY — Dispatch Batch System Migration
-- Run this ONCE on your MySQL/MariaDB database
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Remove seat cap from bookings (no limit anymore — admin dispatches manually)
--    The total_seats column stays on trips for reference but is no longer enforced.

-- 2. Dispatch batches — each batch = one vehicle for a specific route+date
CREATE TABLE IF NOT EXISTS dispatch_batches (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  trip_id              INT          NOT NULL,
  travel_date          DATE         NOT NULL,
  vehicle_type         ENUM('coaster','hiace','other') NOT NULL DEFAULT 'coaster',
  capacity             INT          NOT NULL DEFAULT 24,

  -- How this batch is being dispatched
  dispatch_type        ENUM('tender','own','company') DEFAULT NULL,
  status               ENUM('pending','tendered','assigned','completed') NOT NULL DEFAULT 'pending',

  -- Own-driver assignment (uses users table driver)
  own_driver_id        INT          DEFAULT NULL,

  -- Company assignment (direct, no tender)
  assigned_company_id  INT          DEFAULT NULL,

  -- Driver/car info (filled once company or own driver assigns)
  driver_name          VARCHAR(100) DEFAULT NULL,
  driver_phone         VARCHAR(30)  DEFAULT NULL,
  car_plate            VARCHAR(30)  DEFAULT NULL,
  car_model            VARCHAR(100) DEFAULT NULL,

  -- Tender link (if posted as tender)
  tender_id            INT          DEFAULT NULL,

  notes                TEXT         DEFAULT NULL,
  created_at           TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_trip_date (trip_id, travel_date)
);

-- 3. Map bookings → batches
CREATE TABLE IF NOT EXISTS dispatch_batch_bookings (
  batch_id    INT NOT NULL,
  booking_id  INT NOT NULL,
  PRIMARY KEY (batch_id, booking_id),
  INDEX idx_booking (booking_id)
);

-- 4. Add batch_id to tenders (nullable — old tenders link to trip only)
ALTER TABLE tenders
  ADD COLUMN IF NOT EXISTS batch_id INT DEFAULT NULL AFTER trip_id;

-- ═══════════════════════════════════════════════════════════════════════════
-- Done!
-- ═══════════════════════════════════════════════════════════════════════════
