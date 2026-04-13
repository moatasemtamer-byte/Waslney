-- ============================================================
--  SMART POOL — MySQL migration
--  Run AFTER shuttle.sql (or let migrate.js handle it)
-- ============================================================

-- ── POOL REQUESTS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pool_requests (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  passenger_id   INT NOT NULL,
  origin_lat     DECIMAL(10,8) NOT NULL,
  origin_lng     DECIMAL(11,8) NOT NULL,
  origin_label   VARCHAR(200) DEFAULT '',
  dest_lat       DECIMAL(10,8) NOT NULL,
  dest_lng       DECIMAL(11,8) NOT NULL,
  dest_label     VARCHAR(200) DEFAULT '',
  desired_time   VARCHAR(10)  NOT NULL,
  desired_date   DATE         NOT NULL,
  seats          INT NOT NULL DEFAULT 1,
  pool_group_id  INT          DEFAULT NULL,
  status         ENUM('pending','confirmed','cancelled') NOT NULL DEFAULT 'pending',
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (passenger_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── POOL GROUPS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pool_groups (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  desired_date   DATE         NOT NULL,
  desired_time   VARCHAR(10)  NOT NULL,
  dest_lat       DECIMAL(10,8) NOT NULL,
  dest_lng       DECIMAL(11,8) NOT NULL,
  dest_label     VARCHAR(200) DEFAULT '',
  driver_id      INT          DEFAULT NULL,
  trip_id        INT          DEFAULT NULL,
  status         ENUM('pending','confirmed','cancelled') NOT NULL DEFAULT 'pending',
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (driver_id) REFERENCES users(id)  ON DELETE SET NULL,
  FOREIGN KEY (trip_id)   REFERENCES trips(id)  ON DELETE SET NULL
);

-- ── POOL INVITATIONS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pool_invitations (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  group_id    INT NOT NULL,
  driver_id   INT NOT NULL,
  response    ENUM('pending','accepted','declined') NOT NULL DEFAULT 'pending',
  expires_at  DATETIME DEFAULT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id)  REFERENCES pool_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (driver_id) REFERENCES users(id)       ON DELETE CASCADE
);

-- ── POOL CHATS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pool_chats (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  trip_id     INT NOT NULL UNIQUE,
  group_id    INT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trip_id)  REFERENCES trips(id)       ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES pool_groups(id) ON DELETE CASCADE
);

-- ── POOL CHAT MESSAGES ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS pool_chat_messages (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  trip_id     INT  NOT NULL,
  user_id     INT  NOT NULL,
  message     TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trip_id) REFERENCES trips(id)  ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)  ON DELETE CASCADE
);

-- ── ADD COLUMNS TO EXISTING TABLES ───────────────────────────
ALTER TABLE trip_stops
  ADD COLUMN IF NOT EXISTS passenger_id    INT  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pool_request_id INT  DEFAULT NULL;

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS is_pool TINYINT(1) DEFAULT 0;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS pool_price DECIMAL(10,2) DEFAULT NULL;
