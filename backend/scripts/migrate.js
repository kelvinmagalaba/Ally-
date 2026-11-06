require("dotenv").config();
const db = require("../config/db");
const migrations = [
  require("../migrations/001_cgd_delivery_workflow"),
  require("../migrations/002_separate_payment_state"),
  require("../migrations/003_profile_approval_defaults"),
  require("../migrations/004_inventory_availability"),
  require("../migrations/005_account_display_name"),
  require("../migrations/006_atomic_inventory_reservation"),
];

async function runMigrations() {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(190) PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  for (const migration of migrations) {
    const [rows] = await db.query("SELECT name FROM schema_migrations WHERE name = ?", [migration.name]);
    if (rows.length) continue;
    await migration.up(db);
    await db.query("INSERT INTO schema_migrations (name) VALUES (?)", [migration.name]);
    console.log(`Applied migration: ${migration.name}`);
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log("Database migrations complete");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration failed:", error);
      process.exit(1);
    });
}

module.exports = { runMigrations };
