// Auto-migration: runs on every server start, safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
const db = require('./db');

// Reliable column-add: uses INFORMATION_SCHEMA instead of IF NOT EXISTS (works on all MySQL versions)
async function addCol(table, column, definition) {
  try {
    const [[row]] = await db.query(
      `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    if (row.cnt === 0) {
      await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      console.log(`  + Added column ${table}.${column}`);
    }
  } catch (e) {
    console.error(`  ⚠️  Could not add ${table}.${column}:`, e.message);
  }
}

module.exports = async function runMigrations() {
  try {
    // 1. Ensure trip_stops table exists
    await db.query(`
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
      )
    `);

    // 2. Core column additions (reliable INFORMATION_SCHEMA method)
    await addCol('trip_stops', 'arrived',         'TINYINT(1) NOT NULL DEFAULT 0');
    await addCol('trip_stops', 'passenger_id',    'INT DEFAULT NULL');
    await addCol('trip_stops', 'pool_request_id', 'INT DEFAULT NULL');

    // 3. trips lat/lng columns
    for (const col of ['pickup_lat','pickup_lng','dropoff_lat','dropoff_lng']) {
      await addCol('trips', col, 'DECIMAL(10,8) NULL');
    }

    // 4. is_pool on trips
    await addCol('trips',    'is_pool',    'TINYINT(1) DEFAULT 0');
    await addCol('bookings', 'pool_price', 'DECIMAL(10,2) DEFAULT NULL');

    // 5. Smart Pool tables
    await db.query(`CREATE TABLE IF NOT EXISTS pool_requests(
      id             INT AUTO_INCREMENT PRIMARY KEY,
      passenger_id   INT NOT NULL,
      origin_lat     DECIMAL(10,8) NOT NULL,
      origin_lng     DECIMAL(11,8) NOT NULL,
      origin_label   VARCHAR(200) DEFAULT '',
      dest_lat       DECIMAL(10,8) NOT NULL,
      dest_lng       DECIMAL(11,8) NOT NULL,
      dest_label     VARCHAR(200) DEFAULT '',
      desired_time   VARCHAR(10) NOT NULL,
      desired_date   DATE NOT NULL,
      seats          INT NOT NULL DEFAULT 1,
      pool_group_id  INT DEFAULT NULL,
      status         ENUM('pending','confirmed','cancelled') NOT NULL DEFAULT 'pending',
      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(passenger_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    await db.query(`CREATE TABLE IF NOT EXISTS pool_groups(
      id           INT AUTO_INCREMENT PRIMARY KEY,
      desired_date DATE NOT NULL,
      desired_time VARCHAR(10) NOT NULL,
      dest_lat     DECIMAL(10,8) NOT NULL,
      dest_lng     DECIMAL(11,8) NOT NULL,
      dest_label   VARCHAR(200) DEFAULT '',
      driver_id    INT DEFAULT NULL,
      trip_id      INT DEFAULT NULL,
      status       ENUM('pending','confirmed','cancelled') NOT NULL DEFAULT 'pending',
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(driver_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY(trip_id)   REFERENCES trips(id) ON DELETE SET NULL
    )`);

    await db.query(`CREATE TABLE IF NOT EXISTS pool_invitations(
      id          INT AUTO_INCREMENT PRIMARY KEY,
      group_id    INT NOT NULL,
      driver_id   INT NOT NULL,
      response    ENUM('pending','accepted','declined') NOT NULL DEFAULT 'pending',
      expires_at  DATETIME DEFAULT NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(group_id)  REFERENCES pool_groups(id) ON DELETE CASCADE,
      FOREIGN KEY(driver_id) REFERENCES users(id)       ON DELETE CASCADE
    )`);

    await db.query(`CREATE TABLE IF NOT EXISTS pool_chats(
      id         INT AUTO_INCREMENT PRIMARY KEY,
      trip_id    INT NOT NULL UNIQUE,
      group_id   INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(trip_id)  REFERENCES trips(id)       ON DELETE CASCADE,
      FOREIGN KEY(group_id) REFERENCES pool_groups(id) ON DELETE CASCADE
    )`);

    await db.query(`CREATE TABLE IF NOT EXISTS pool_chat_messages(
      id         INT AUTO_INCREMENT PRIMARY KEY,
      trip_id    INT NOT NULL,
      user_id    INT NOT NULL,
      message    TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(trip_id) REFERENCES trips(id)  ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id)  ON DELETE CASCADE
    )`);

    // ── Driver document review system ──────────────────────────────────────
    // Add account_status, profile_photo, rejection_note to users
    await addCol('users', 'account_status', "ENUM('active','pending_review','rejected') NOT NULL DEFAULT 'active'");
    await addCol('users', 'profile_photo',  'LONGTEXT DEFAULT NULL');
    await addCol('users', 'rejection_note', 'TEXT DEFAULT NULL');

    // Upgrade profile_photo to LONGTEXT if it was added as MEDIUMTEXT previously
    try {
      const [[colInfo]] = await db.query(
        `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='profile_photo'`
      );
      if (colInfo && colInfo.DATA_TYPE === 'mediumtext') {
        await db.query('ALTER TABLE `users` MODIFY COLUMN `profile_photo` LONGTEXT DEFAULT NULL');
        console.log('  + Upgraded users.profile_photo to LONGTEXT');
      }
    } catch(_) {}

    // driver_documents: stores base64 photos of the 3 required documents
    await db.query(`CREATE TABLE IF NOT EXISTS driver_documents (
      id                    INT AUTO_INCREMENT PRIMARY KEY,
      user_id               INT NOT NULL UNIQUE,
      car_license_photo     LONGTEXT NOT NULL COMMENT 'رخصة العربية',
      driver_license_photo  LONGTEXT NOT NULL COMMENT 'رخصة السائق',
      criminal_record_photo LONGTEXT NOT NULL COMMENT 'الفيش الجنائي',
      submitted_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      reviewed_at           TIMESTAMP NULL,
      reviewed_by           INT DEFAULT NULL,
      FOREIGN KEY(user_id)     REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(reviewed_by) REFERENCES users(id) ON DELETE SET NULL
    )`);

    console.log('✅  Migrations done');
  } catch (err) {
    console.error('⚠️  Migration warning:', err.message);
    // Don't crash — log and continue
  }
};
