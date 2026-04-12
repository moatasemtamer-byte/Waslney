-- ============================================================
--  SHUTTLE — MySQL Database
--  Import this file in phpMyAdmin before running the app
-- ============================================================

CREATE DATABASE IF NOT EXISTS shuttle CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE shuttle;

-- ── USERS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  phone       VARCHAR(20)  NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,
  role        ENUM('passenger','driver','admin') NOT NULL DEFAULT 'passenger',
  car         VARCHAR(100),
  plate       VARCHAR(30),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── TRIPS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trips (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  from_loc     VARCHAR(150) NOT NULL,
  to_loc       VARCHAR(150) NOT NULL,
  pickup_time  VARCHAR(10)  NOT NULL,
  dropoff_time VARCHAR(10),
  date         DATE         NOT NULL,
  price        DECIMAL(10,2) NOT NULL,
  total_seats  INT NOT NULL DEFAULT 16,
  driver_id    INT,
  status       ENUM('upcoming','active','completed','cancelled') NOT NULL DEFAULT 'upcoming',
  pickup_lat   DECIMAL(10,8),
  pickup_lng   DECIMAL(11,8),
  dropoff_lat  DECIMAL(10,8),
  dropoff_lng  DECIMAL(11,8),
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ── BOOKINGS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  trip_id      INT NOT NULL,
  passenger_id INT NOT NULL,
  seats        INT NOT NULL DEFAULT 1,
  pickup_note  VARCHAR(200),
  status       ENUM('confirmed','cancelled','completed') NOT NULL DEFAULT 'confirmed',
  rated        TINYINT(1) DEFAULT 0,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trip_id)      REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (passenger_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── CHECKINS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checkins (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  booking_id  INT NOT NULL UNIQUE,
  status      ENUM('pending','picked','noshow','dropped') NOT NULL DEFAULT 'pending',
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

-- ── RATINGS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ratings (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  trip_id      INT NOT NULL,
  passenger_id INT NOT NULL,
  driver_id    INT NOT NULL,
  stars        TINYINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment      TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trip_id)      REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (passenger_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (driver_id)    REFERENCES users(id) ON DELETE CASCADE
);

-- ── NOTIFICATIONS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  message    TEXT NOT NULL,
  is_read    TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── DRIVER LOCATIONS (real-time) ───────────────────────────
CREATE TABLE IF NOT EXISTS driver_locations (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  driver_id  INT NOT NULL UNIQUE,
  trip_id    INT,
  lat        DECIMAL(10,8) NOT NULL,
  lng        DECIMAL(11,8) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (trip_id)   REFERENCES trips(id)  ON DELETE SET NULL
);


-- ── TRIP STOPS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trip_stops (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  trip_id    INT NOT NULL,
  type       ENUM('pickup','dropoff') NOT NULL,
  label      VARCHAR(150),
  lat        DECIMAL(10,7) NOT NULL,
  lng        DECIMAL(10,7) NOT NULL,
  stop_order INT NOT NULL DEFAULT 0,
  arrived    TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

-- ============================================================
--  SEED DATA
-- ============================================================

-- Passwords are all "password123" hashed with bcrypt rounds=10
-- Hash: $2b$10$YourHashHere  (generated at runtime — see README)
-- For demo we insert a known bcrypt hash of "password123"

INSERT INTO users (name, phone, password, role, car, plate) VALUES
('Ahmed Hassan',   '+20100111222', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'passenger', NULL, NULL),
('Sara Mohamed',   '+20100222333', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'passenger', NULL, NULL),
('Omar Khalil',    '+20100333444', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'passenger', NULL, NULL),
('Khaled Mohamed', '+20101333444', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'driver', 'Toyota Hiace 2022', 'أ ب ج 1234'),
('Mohamed Amr',    '+20101444555', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'driver', 'Ford Transit 2021', 'د هـ و 5678'),
('Tamer Ibrahim',  '+20102555666', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'driver', 'Hyundai H350 2023', 'ز ح ط 9012'),
('Admin',          '+20100000001', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin',  NULL, NULL);

-- Trips with real Cairo coordinates (driver_id 4=Khaled, 5=Mohamed, 6=Tamer)
INSERT INTO trips (from_loc, to_loc, pickup_time, dropoff_time, date, price, total_seats, driver_id, status, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng) VALUES
('Nasr City',  'Maadi',          '07:00', '07:55', CURDATE(),                            45, 16, 4, 'upcoming',  30.06260, 31.34790, 29.96020, 31.25690),
('Heliopolis', 'New Cairo',      '08:00', '08:40', CURDATE(),                            35, 16, 5, 'upcoming',  30.08750, 31.34110, 30.02900, 31.46800),
('Zamalek',    '6th October',    '06:30', '07:30', CURDATE(),                            55, 16, 6, 'upcoming',  30.05800, 31.22900, 29.93050, 30.92740),
('Nasr City',  'Heliopolis',     '09:00', '09:25', DATE_ADD(CURDATE(),INTERVAL 1 DAY),   25, 16, 4, 'upcoming',  30.06260, 31.34790, 30.08750, 31.34110),
('Maadi',      'Downtown Cairo', '07:30', '08:10', DATE_ADD(CURDATE(),INTERVAL 1 DAY),   30, 16, 5, 'upcoming',  29.96020, 31.25690, 30.04440, 31.23570),
('Nasr City',  'Maadi',          '07:00', '07:55', DATE_SUB(CURDATE(),INTERVAL 7 DAY),   45, 16, 4, 'completed', 30.06260, 31.34790, 29.96020, 31.25690),
('Heliopolis', 'New Cairo',      '08:00', '08:40', DATE_SUB(CURDATE(),INTERVAL 14 DAY),  35, 16, 5, 'completed', 30.08750, 31.34110, 30.02900, 31.46800);

-- Bookings
INSERT INTO bookings (trip_id, passenger_id, seats, pickup_note, status, rated) VALUES
(1, 1, 2, 'Omar Ibn El-Khattab St.', 'confirmed', 0),
(1, 2, 1, 'Abbas El-Akkad',          'confirmed', 0),
(2, 2, 1, 'Salah Salem',             'confirmed', 0),
(6, 1, 2, 'City Stars Gate',         'completed', 1),
(7, 1, 1, 'Merghany St.',            'completed', 1);

-- Checkins for active bookings
INSERT INTO checkins (booking_id, status) VALUES
(1, 'pending'),
(2, 'pending'),
(3, 'pending');

-- Ratings for completed trips
INSERT INTO ratings (trip_id, passenger_id, driver_id, stars, comment) VALUES
(6, 1, 4, 5, 'Great driver, very punctual!'),
(7, 1, 5, 4, 'Comfortable ride, slightly late.');

-- Notifications
INSERT INTO notifications (user_id, message, is_read) VALUES
(1, 'Booking confirmed: Nasr City → Maadi', 0),
(4, 'New booking: Ahmed Hassan reserved 2 seats on Trip #1', 0),
(2, 'Booking confirmed: Nasr City → Maadi', 0),
(4, 'New booking: Sara Mohamed reserved 1 seat on Trip #1', 0);

-- Driver locations (Cairo area defaults)
INSERT INTO driver_locations (driver_id, trip_id, lat, lng) VALUES
(4, 1, 30.0626, 31.3479),
(5, 2, 30.0875, 31.3411),
(6, 3, 30.0580, 31.2290);
