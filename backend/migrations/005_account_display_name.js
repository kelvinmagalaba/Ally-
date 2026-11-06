const name = "005_account_display_name";

async function up(db) {
  const [columns] = await db.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'account_display_name' LIMIT 1`
  );
  if (!columns.length) {
    await db.query("ALTER TABLE users ADD COLUMN account_display_name VARCHAR(255) NULL AFTER role");
  }
}

module.exports = { name, up };
