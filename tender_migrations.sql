-- =============================================================
--  Waslney Tender System — SQL Migrations
--  Run these once in your MySQL database
-- =============================================================

-- Companies table
CREATE TABLE IF NOT EXISTS companies (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  company_name  VARCHAR(120) NOT NULL UNIQUE,
  fleet_number  VARCHAR(60)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Company drivers
CREATE TABLE IF NOT EXISTS company_drivers (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  company_id     INT NOT NULL,
  name           VARCHAR(100) NOT NULL,
  phone          VARCHAR(30),
  license_number VARCHAR(60),
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- Company cars
CREATE TABLE IF NOT EXISTS company_cars (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  plate      VARCHAR(30) NOT NULL,
  model      VARCHAR(80),
  capacity   INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- Tenders (one per trip)
CREATE TABLE IF NOT EXISTS tenders (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  trip_id            INT NOT NULL,
  description        TEXT,
  status             ENUM('open','awarded','cancelled') DEFAULT 'open',
  ends_at            DATETIME NOT NULL,
  winner_company_id  INT,
  awarded_amount     DECIMAL(10,2),
  awarded_at         DATETIME,
  assigned_driver_id INT,
  assigned_car_id    INT,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (winner_company_id) REFERENCES companies(id) ON DELETE SET NULL
);

-- Bids (one per company per tender, upserted)
CREATE TABLE IF NOT EXISTS bids (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  tender_id  INT NOT NULL,
  company_id INT NOT NULL,
  amount     DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tender_company (tender_id, company_id),
  FOREIGN KEY (tender_id)  REFERENCES tenders(id)  ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- Add tendered/awarded status to trips if not already in ENUM
-- (run only if your trips.status column doesn't include these values)
-- ALTER TABLE trips MODIFY COLUMN status ENUM('upcoming','active','completed','cancelled','tendered','assigned') DEFAULT 'upcoming';
