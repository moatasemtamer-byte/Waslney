// Auto-migration: runs on every server start, safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
const db = require('./db');

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

    // 2. Ensure arrived column exists (for DBs created before this migration)
    try {
      await db.query('ALTER TABLE trip_stops ADD COLUMN IF NOT EXISTS arrived TINYINT(1) NOT NULL DEFAULT 0');
    } catch (_) {}

    // 3. Ensure trips table has lat/lng columns
    const latCols = ['pickup_lat','pickup_lng','dropoff_lat','dropoff_lng'];
    for (const col of latCols) {
      try {
        await db.query(`ALTER TABLE trips ADD COLUMN IF NOT EXISTS ${col} DECIMAL(10,8) NULL`);
      } catch (_) {}
    }

    console.log('✅  Migrations done');
  } catch (err) {
    console.error('⚠️  Migration warning:', err.message);
    // Don't crash — log and continue
  }
};
