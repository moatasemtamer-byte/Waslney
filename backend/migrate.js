const db = require('./db');

async function addColumnIfMissing(table, column, definition) {
  try {
    const [cols] = await db.query(`SHOW COLUMNS FROM \`${table}\` LIKE '${column}'`);
    if (cols.length === 0) {
      await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      console.log(`  ✅ Added ${table}.${column}`);
    }
  } catch (e) {
    console.warn(`  ⚠️  Could not add ${table}.${column}:`, e.message);
  }
}

module.exports = async function runMigrations() {
  try {
    // 1. Ensure trip_stops table exists (without arrived — added separately below)
    await db.query(`
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
      )
    `);

    // 2. Add arrived column safely (compatible with all MySQL versions)
    await addColumnIfMissing('trip_stops', 'arrived', 'TINYINT(1) NOT NULL DEFAULT 0');

    // 3. Add lat/lng columns to trips table
    for (const col of ['pickup_lat','pickup_lng','dropoff_lat','dropoff_lng']) {
      await addColumnIfMissing('trips', col, 'DECIMAL(10,8) NULL');
    }

    // 4. Add checkins table if missing
    await db.query(`
      CREATE TABLE IF NOT EXISTS checkins (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        booking_id INT NOT NULL UNIQUE,
        status     ENUM('pending','picked','noshow','dropped') NOT NULL DEFAULT 'pending',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
      )
    `);

    console.log('✅  All migrations done');
  } catch (err) {
    console.error('⚠️  Migration error:', err.message);
  }
};
