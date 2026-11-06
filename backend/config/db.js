const mysql = require("mysql2");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME || "gas_delivery",
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  waitForConnections: true,
  queueLimit: 0,
  charset: "utf8mb4",
});

/**
 * The existing project mixes callback-style mysql2 queries with `await db.query()`.
 * Keep both contracts working while using a production-friendly connection pool.
 */
function query(sql, params, callback) {
  let values = params;
  let cb = callback;
  if (typeof params === "function") {
    cb = params;
    values = [];
  }
  if (typeof cb === "function") return pool.query(sql, values || [], cb);
  return pool.promise().query(sql, values || []);
}

function execute(sql, params, callback) {
  if (typeof callback === "function") return pool.execute(sql, params || [], callback);
  return pool.promise().execute(sql, params || []);
}

function getConnection() {
  return pool.promise().getConnection();
}

if (process.env.NODE_ENV !== "test") {
  pool.getConnection((err, connection) => {
    if (err) {
      console.error("Database connection failed:", err.message);
      return;
    }
    console.log("MySQL connection pool ready");
    connection.release();
  });
}

module.exports = { query, execute, getConnection, pool };
