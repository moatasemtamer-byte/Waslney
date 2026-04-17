require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  user:               process.env.DB_USER     || 'u946447529_Moatasem',
  password:           process.env.DB_PASS     || 'Ilovemom_dad2',
  database:           process.env.DB_NAME     || 'u946447529_Wasalney',
  port:               parseInt(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           '+00:00',
  // Keeps connection alive on shared hosting
  enableKeepAlive:    true,
  keepAliveInitialDelay: 0,
});

pool.getConnection()
  .then(conn => {
    console.log(`✅  MySQL connected — database: ${process.env.DB_NAME || 'u946447529_Wasalney'}`);
    conn.release();
  })
  .catch(err => {
    console.error('❌  MySQL connection failed:', err.message);
    console.error('    Host:', process.env.DB_HOST);
    console.error('    User:', process.env.DB_USER);
    console.error('    DB:  ', process.env.DB_NAME);
    console.error('    Port:', process.env.DB_PORT);
    process.exit(1);
  });

module.exports = pool;
