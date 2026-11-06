const name = "006_atomic_inventory_reservation";

async function up(db) {
  const [columns] = await db.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders'
       AND COLUMN_NAME = 'inventory_deducted' LIMIT 1`
  );
  if (!columns.length) {
    await db.query("ALTER TABLE orders ADD COLUMN inventory_deducted TINYINT(1) NOT NULL DEFAULT 0 AFTER quantity");
  }
}

module.exports = { name, up };
