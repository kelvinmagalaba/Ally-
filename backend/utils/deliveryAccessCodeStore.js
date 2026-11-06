const TTL_MS = 1000 * 60 * 60 * 4; // 4 hours

const byOrderId = new Map();

function makeCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function setCode(orderId, supplierId) {
  const code = makeCode();
  const row = {
    orderId: Number(orderId),
    supplierId: Number(supplierId),
    code,
    createdAt: Date.now(),
    expiresAt: Date.now() + TTL_MS,
  };
  byOrderId.set(Number(orderId), row);
  return row;
}

function getByOrder(orderId) {
  const row = byOrderId.get(Number(orderId));
  if (!row) return null;
  if (Date.now() > row.expiresAt) {
    byOrderId.delete(Number(orderId));
    return null;
  }
  return row;
}

function verify(orderId, code) {
  const row = getByOrder(orderId);
  if (!row) return { ok: false, reason: "missing" };
  if (String(row.code).toUpperCase() !== String(code || "").trim().toUpperCase()) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, row };
}

function consumeByCode(code) {
  const normalized = String(code || "").trim().toUpperCase();
  for (const [orderId, row] of byOrderId.entries()) {
    if (Date.now() > row.expiresAt) {
      byOrderId.delete(orderId);
      continue;
    }
    if (String(row.code).toUpperCase() === normalized) {
      byOrderId.delete(orderId);
      return row;
    }
  }
  return null;
}

module.exports = {
  setCode,
  getByOrder,
  verify,
  consumeByCode,
};
