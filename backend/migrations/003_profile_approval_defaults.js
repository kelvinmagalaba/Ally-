const name = "003_profile_approval_defaults";

async function up(db) {
  await db.query("UPDATE suppliers SET verified = approved WHERE verified = 0 AND approved = 1");
  await db.query("ALTER TABLE suppliers MODIFY approved TINYINT(1) NOT NULL DEFAULT 0");
  await db.query("ALTER TABLE suppliers MODIFY verified TINYINT(1) NOT NULL DEFAULT 0");
  await db.query("ALTER TABLE delivery_guy MODIFY approved TINYINT(1) NOT NULL DEFAULT 0");
}

module.exports = { name, up };
