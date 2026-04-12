-- Add trip_stops table for multiple pickup/dropoff points
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS pickup_lat  DECIMAL(10,7) NULL,
  ADD COLUMN IF NOT EXISTS pickup_lng  DECIMAL(10,7) NULL,
  ADD COLUMN IF NOT EXISTS dropoff_lat DECIMAL(10,7) NULL,
  ADD COLUMN IF NOT EXISTS dropoff_lng DECIMAL(10,7) NULL;

CREATE TABLE IF NOT EXISTS trip_stops (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  trip_id    INT NOT NULL,
  type       ENUM('pickup','dropoff') NOT NULL,
  label      VARCHAR(150),
  lat        DECIMAL(10,7) NOT NULL,
  lng        DECIMAL(10,7) NOT NULL,
  stop_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);
