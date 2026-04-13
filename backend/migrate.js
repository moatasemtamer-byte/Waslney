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

    // 4. Smart Pool tables
    await db.query(`CREATE TABLE IF NOT EXISTS pool_requests(id INT AUTO_INCREMENT PRIMARY KEY,passenger_id INT NOT NULL,origin_lat DECIMAL(10,8) NOT NULL,origin_lng DECIMAL(11,8) NOT NULL,origin_label VARCHAR(200) DEFAULT '',dest_lat DECIMAL(10,8) NOT NULL,dest_lng DECIMAL(11,8) NOT NULL,dest_label VARCHAR(200) DEFAULT '',desired_time VARCHAR(10) NOT NULL,desired_date DATE NOT NULL,seats INT NOT NULL DEFAULT 1,pool_group_id INT DEFAULT NULL,status ENUM('pending','confirmed','cancelled') NOT NULL DEFAULT 'pending',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(passenger_id)REFERENCES users(id)ON DELETE CASCADE)`);
    await db.query(`CREATE TABLE IF NOT EXISTS pool_groups(id INT AUTO_INCREMENT PRIMARY KEY,desired_date DATE NOT NULL,desired_time VARCHAR(10) NOT NULL,dest_lat DECIMAL(10,8) NOT NULL,dest_lng DECIMAL(11,8) NOT NULL,dest_label VARCHAR(200) DEFAULT '',driver_id INT DEFAULT NULL,trip_id INT DEFAULT NULL,status ENUM('pending','confirmed','cancelled') NOT NULL DEFAULT 'pending',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(driver_id)REFERENCES users(id)ON DELETE SET NULL,FOREIGN KEY(trip_id)REFERENCES trips(id)ON DELETE SET NULL)`);
    await db.query(`CREATE TABLE IF NOT EXISTS pool_invitations(id INT AUTO_INCREMENT PRIMARY KEY,group_id INT NOT NULL,driver_id INT NOT NULL,response ENUM('pending','accepted','declined') NOT NULL DEFAULT 'pending',expires_at DATETIME DEFAULT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(group_id)REFERENCES pool_groups(id)ON DELETE CASCADE,FOREIGN KEY(driver_id)REFERENCES users(id)ON DELETE CASCADE)`);
    await db.query(`CREATE TABLE IF NOT EXISTS pool_chats(id INT AUTO_INCREMENT PRIMARY KEY,trip_id INT NOT NULL UNIQUE,group_id INT NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(trip_id)REFERENCES trips(id)ON DELETE CASCADE,FOREIGN KEY(group_id)REFERENCES pool_groups(id)ON DELETE CASCADE)`);
    await db.query(`CREATE TABLE IF NOT EXISTS pool_chat_messages(id INT AUTO_INCREMENT PRIMARY KEY,trip_id INT NOT NULL,user_id INT NOT NULL,message TEXT NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(trip_id)REFERENCES trips(id)ON DELETE CASCADE,FOREIGN KEY(user_id)REFERENCES users(id)ON DELETE CASCADE)`);
    const poolCols=[['trip_stops','passenger_id','INT DEFAULT NULL'],['trip_stops','pool_request_id','INT DEFAULT NULL'],['trips','is_pool','TINYINT(1) DEFAULT 0'],['bookings','pool_price','DECIMAL(10,2) DEFAULT NULL']];
    for(const[tbl,col,def]of poolCols){try{await db.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS ${col} ${def}`);}catch(_){}}

    console.log('✅  Migrations done');
  } catch (err) {
    console.error('⚠️  Migration warning:', err.message);
    // Don't crash — log and continue
  }
};
