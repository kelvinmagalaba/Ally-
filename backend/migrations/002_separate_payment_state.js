const name = "002_separate_payment_state";

async function columnExists(db, column) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = ?`,
    [column]
  );
  return Number(rows[0]?.count || 0) > 0;
}

async function up(db) {
  const columns = {
    payment_status: "VARCHAR(32) NOT NULL DEFAULT 'unpaid'",
    payment_method: "VARCHAR(64) NULL",
    payment_submitted_at: "TIMESTAMP NULL",
    payment_confirmed_at: "TIMESTAMP NULL",
  };
  for (const [column, definition] of Object.entries(columns)) {
    if (!(await columnExists(db, column))) {
      await db.query(`ALTER TABLE orders ADD COLUMN \`${column}\` ${definition}`);
    }
  }
  await db.query(
    `UPDATE orders SET payment_status = 'submitted'
     WHERE status = 'processing_payment' AND receipt_code IS NULL`
  );
  await db.query(
    `UPDATE orders SET payment_status = 'confirmed'
     WHERE receipt_code IS NOT NULL`
  );
  await db.query(
    `UPDATE orders SET status = CASE WHEN driver_id IS NULL THEN 'accepted' ELSE 'driver_assigned' END
     WHERE status = 'processing_payment'`
  );
}

module.exports = { name, up };
