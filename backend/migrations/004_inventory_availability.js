const name = "004_inventory_availability";

async function up(db) {
  await db.query("ALTER TABLE gas_prices MODIFY stock_quantity INT NOT NULL DEFAULT 0");
  await db.query("ALTER TABLE gas_prices MODIFY available TINYINT(1) NOT NULL DEFAULT 0");
  await db.query("UPDATE gas_prices SET available = CASE WHEN stock_quantity > 0 THEN 1 ELSE 0 END");
}

module.exports = { name, up };
