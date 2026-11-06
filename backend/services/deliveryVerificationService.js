const crypto = require("crypto");
const db = require("../config/db");

function hashCode(code) {
  const pepper = process.env.DELIVERY_CODE_PEPPER || process.env.AUTH_TOKEN_SECRET || "cgd-development-pepper";
  return crypto.createHmac("sha256", pepper).update(String(code)).digest("hex");
}

function generateCode() {
  return String(crypto.randomInt(100000, 1000000));
}

async function issueCode(orderId) {
  const code = generateCode();
  const ttlMinutes = Math.max(10, Number(process.env.DELIVERY_CODE_TTL_MINUTES || 240));
  const maxAttempts = Math.max(3, Number(process.env.DELIVERY_CODE_MAX_ATTEMPTS || 5));
  await db.query(
    `INSERT INTO delivery_verifications (order_id, code_hash, expires_at, attempts, max_attempts, used_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), 0, ?, NULL)
     ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash), expires_at = VALUES(expires_at),
       attempts = 0, max_attempts = VALUES(max_attempts), used_at = NULL, created_at = CURRENT_TIMESTAMP`,
    [orderId, hashCode(code), ttlMinutes, maxAttempts]
  );
  return { code, expiresInMinutes: ttlMinutes };
}

async function verifyCode(orderId, code, executor = db) {
  const [rows] = await executor.query("SELECT * FROM delivery_verifications WHERE order_id = ? FOR UPDATE", [orderId]);
  const row = rows[0];
  if (!row) return { ok: false, reason: "missing" };
  if (row.used_at) return { ok: false, reason: "used" };
  if (new Date(row.expires_at).getTime() <= Date.now()) return { ok: false, reason: "expired" };
  if (Number(row.attempts) >= Number(row.max_attempts)) return { ok: false, reason: "locked" };
  const expected = Buffer.from(String(row.code_hash));
  const received = Buffer.from(hashCode(String(code || "").trim()));
  const matches = expected.length === received.length && crypto.timingSafeEqual(expected, received);
  if (!matches) {
    await executor.query("UPDATE delivery_verifications SET attempts = attempts + 1 WHERE order_id = ?", [orderId]);
    return { ok: false, reason: "invalid", remainingAttempts: Math.max(0, Number(row.max_attempts) - Number(row.attempts) - 1) };
  }
  const [result] = await executor.query(
    "UPDATE delivery_verifications SET used_at = NOW() WHERE order_id = ? AND used_at IS NULL",
    [orderId]
  );
  return result.affectedRows ? { ok: true } : { ok: false, reason: "used" };
}

module.exports = { hashCode, generateCode, issueCode, verifyCode };
