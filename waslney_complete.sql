-- ============================================================
--  WASLNEY — Complete Database Schema
--  Import this in phpMyAdmin for u946447529_Wasalney
--  Run this ONCE on the new hosting database.
--  All statements use IF NOT EXISTS so safe to re-run.
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ── 1. USERS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `users` (
  `id`         INT AUTO_INCREMENT PRIMARY KEY,
  `name`       VARCHAR(100) NOT NULL,
  `phone`      VARCHAR(20)  NOT NULL UNIQUE,
  `password`   VARCHAR(255) NOT NULL,
  `role`       ENUM('passenger','driver','admin') NOT NULL DEFAULT 'passenger',
  `car`        VARCHAR(100) DEFAULT NULL,
  `plate`      VARCHAR(30)  DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 2. TRIPS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `trips` (
  `id`           INT AUTO_INCREMENT PRIMARY KEY,
  `from_loc`     VARCHAR(150) NOT NULL,
  `to_loc`       VARCHAR(150) NOT NULL,
  `pickup_time`  VARCHAR(10)  NOT NULL,
  `dropoff_time` VARCHAR(10)  DEFAULT NULL,
  `date`         DATE         NOT NULL,
  `price`        DECIMAL(10,2) NOT NULL,
  `total_seats`  INT NOT NULL DEFAULT 16,
  `booked_seats` INT NOT NULL DEFAULT 0,
  `driver_id`    INT DEFAULT NULL,
  `status`       ENUM('upcoming','active','completed','cancelled') NOT NULL DEFAULT 'upcoming',
  `pickup_lat`   DECIMAL(10,8) DEFAULT NULL,
  `pickup_lng`   DECIMAL(11,8) DEFAULT NULL,
  `dropoff_lat`  DECIMAL(10,8) DEFAULT NULL,
  `dropoff_lng`  DECIMAL(11,8) DEFAULT NULL,
  `is_pool`      TINYINT(1) NOT NULL DEFAULT 0,
  `avg_rating`   DECIMAL(3,2) DEFAULT 0.00,
  `created_at`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`driver_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 3. TRIP STOPS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `trip_stops` (
  `id`              INT AUTO_INCREMENT PRIMARY KEY,
  `trip_id`         INT NOT NULL,
  `type`            ENUM('pickup','dropoff') NOT NULL,
  `label`           VARCHAR(150) DEFAULT NULL,
  `lat`             DECIMAL(10,7) NOT NULL,
  `lng`             DECIMAL(10,7) NOT NULL,
  `stop_order`      INT NOT NULL DEFAULT 0,
  `arrived`         TINYINT(1) NOT NULL DEFAULT 0,
  `passenger_id`    INT DEFAULT NULL,
  `pool_request_id` INT DEFAULT NULL,
  `created_at`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 4. BOOKINGS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `bookings` (
  `id`             INT AUTO_INCREMENT PRIMARY KEY,
  `trip_id`        INT NOT NULL,
  `passenger_id`   INT NOT NULL,
  `seats`          INT NOT NULL DEFAULT 1,
  `pickup_note`    VARCHAR(200) DEFAULT NULL,
  `status`         ENUM('confirmed','cancelled','completed') NOT NULL DEFAULT 'confirmed',
  `checkin_status` ENUM('pending','picked','noshow','dropped') NOT NULL DEFAULT 'pending',
  `rated`          TINYINT(1) DEFAULT 0,
  `pool_price`     DECIMAL(10,2) DEFAULT NULL,
  `created_at`     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`trip_id`)      REFERENCES `trips`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`passenger_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 5. CHECKINS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `checkins` (
  `id`         INT AUTO_INCREMENT PRIMARY KEY,
  `booking_id` INT NOT NULL UNIQUE,
  `status`     ENUM('pending','picked','noshow','dropped') NOT NULL DEFAULT 'pending',
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 6. RATINGS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ratings` (
  `id`           INT AUTO_INCREMENT PRIMARY KEY,
  `trip_id`      INT NOT NULL,
  `passenger_id` INT NOT NULL,
  `driver_id`    INT NOT NULL,
  `stars`        TINYINT NOT NULL,
  `comment`      TEXT DEFAULT NULL,
  `created_at`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`trip_id`)      REFERENCES `trips`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`passenger_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`driver_id`)    REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 7. NOTIFICATIONS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `notifications` (
  `id`         INT AUTO_INCREMENT PRIMARY KEY,
  `user_id`    INT NOT NULL,
  `message`    TEXT NOT NULL,
  `is_read`    TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 8. DRIVER LOCATIONS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS `driver_locations` (
  `id`         INT AUTO_INCREMENT PRIMARY KEY,
  `driver_id`  INT NOT NULL UNIQUE,
  `trip_id`    INT DEFAULT NULL,
  `lat`        DECIMAL(10,8) NOT NULL,
  `lng`        DECIMAL(11,8) NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`driver_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`trip_id`)   REFERENCES `trips`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 9. POOL REQUESTS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `pool_requests` (
  `id`            INT AUTO_INCREMENT PRIMARY KEY,
  `passenger_id`  INT NOT NULL,
  `origin_lat`    DECIMAL(10,8) NOT NULL,
  `origin_lng`    DECIMAL(11,8) NOT NULL,
  `origin_label`  VARCHAR(200) DEFAULT '',
  `dest_lat`      DECIMAL(10,8) NOT NULL,
  `dest_lng`      DECIMAL(11,8) NOT NULL,
  `dest_label`    VARCHAR(200) DEFAULT '',
  `desired_time`  VARCHAR(10) NOT NULL,
  `desired_date`  DATE NOT NULL,
  `seats`         INT NOT NULL DEFAULT 1,
  `pool_group_id` INT DEFAULT NULL,
  `status`        ENUM('pending','confirmed','cancelled') NOT NULL DEFAULT 'pending',
  `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`passenger_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 10. POOL GROUPS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `pool_groups` (
  `id`           INT AUTO_INCREMENT PRIMARY KEY,
  `desired_date` DATE NOT NULL,
  `desired_time` VARCHAR(10) NOT NULL,
  `dest_lat`     DECIMAL(10,8) NOT NULL,
  `dest_lng`     DECIMAL(11,8) NOT NULL,
  `dest_label`   VARCHAR(200) DEFAULT '',
  `driver_id`    INT DEFAULT NULL,
  `trip_id`      INT DEFAULT NULL,
  `status`       ENUM('pending','confirmed','cancelled') NOT NULL DEFAULT 'pending',
  `created_at`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`driver_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`trip_id`)   REFERENCES `trips`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 11. POOL INVITATIONS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS `pool_invitations` (
  `id`         INT AUTO_INCREMENT PRIMARY KEY,
  `group_id`   INT NOT NULL,
  `driver_id`  INT NOT NULL,
  `response`   ENUM('pending','accepted','declined') NOT NULL DEFAULT 'pending',
  `expires_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`group_id`)  REFERENCES `pool_groups`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`driver_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 12. POOL CHATS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `pool_chats` (
  `id`         INT AUTO_INCREMENT PRIMARY KEY,
  `trip_id`    INT NOT NULL UNIQUE,
  `group_id`   INT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`trip_id`)  REFERENCES `trips`(`id`)       ON DELETE CASCADE,
  FOREIGN KEY (`group_id`) REFERENCES `pool_groups`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 13. POOL CHAT MESSAGES ───────────────────────────────────
CREATE TABLE IF NOT EXISTS `pool_chat_messages` (
  `id`         INT AUTO_INCREMENT PRIMARY KEY,
  `trip_id`    INT NOT NULL,
  `user_id`    INT NOT NULL,
  `message`    TEXT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- ── DONE ─────────────────────────────────────────────────────
-- All 13 tables created. You can now run the Node.js backend.
-- The app will connect using:
--   DB_HOST=localhost
--   DB_USER=u946447529_Moatasem
--   DB_PASS=Ilovemom_dad2
--   DB_NAME=u946447529_Wasalney
--   DB_PORT=3306
