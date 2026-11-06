const db = require("../config/db");
const { verifyAuthToken } = require("../utils/authToken");

function extractToken(req) {
  const value = String(req.headers.authorization || "");
  if (/^Bearer\s+/i.test(value)) return value.replace(/^Bearer\s+/i, "").trim();
  return "";
}

async function requireAuth(req, res, next) {
  try {
    const decoded = verifyAuthToken(extractToken(req));
    const [rows] = await db.query("SELECT id, role FROM users WHERE id = ? LIMIT 1", [decoded.id]);
    if (!rows[0]) return res.status(401).json({ message: "Account no longer exists" });
    req.auth = { id: Number(rows[0].id), role: String(rows[0].role) };
    next();
  } catch (error) {
    return res.status(401).json({ message: error.message || "Authentication required" });
  }
}

function requireRole(...roles) {
  const allowed = new Set(roles);
  return (req, res, next) => {
    if (!req.auth || !allowed.has(req.auth.role)) {
      return res.status(403).json({ message: "You are not allowed to perform this action" });
    }
    next();
  };
}

function requireSelfParam(paramName = "userId") {
  return (req, res, next) => {
    if (req.auth?.role === "admin" || Number(req.params[paramName]) === Number(req.auth?.id)) return next();
    return res.status(403).json({ message: "You can only access your own account" });
  };
}

function requireSelfBody(...fieldNames) {
  return (req, res, next) => {
    if (req.auth?.role === "admin") return next();
    const value = fieldNames.map((name) => req.body?.[name]).find((candidate) => candidate != null);
    if (Number(value) === Number(req.auth?.id)) return next();
    return res.status(403).json({ message: "The account identifier does not match the signed-in user" });
  };
}

function requireOrderAccessParam(paramName = "orderId") {
  return async (req, res, next) => {
    try {
      const [rows] = await db.query(
        `SELECT o.customer_id, o.supplier_id, dg.user_id AS driver_user_id
         FROM orders o LEFT JOIN delivery_guy dg ON dg.id = o.driver_id WHERE o.id = ?`,
        [req.params[paramName]]
      );
      const order = rows[0];
      const allowed = order && (req.auth.role === "admin" || Number(order.customer_id) === req.auth.id ||
        Number(order.supplier_id) === req.auth.id || Number(order.driver_user_id) === req.auth.id);
      if (!allowed) return res.status(403).json({ message: "You cannot access this order" });
      next();
    } catch (error) {
      res.status(500).json({ message: error.message || "Could not verify order access" });
    }
  };
}

function requireAssignedDriverOrderBody(fieldName = "order_id") {
  return async (req, res, next) => {
    if (!["driver", "delivery_guy"].includes(req.auth?.role)) {
      return res.status(403).json({ message: "Only an assigned driver can publish delivery location" });
    }
    try {
      const [rows] = await db.query(
        `SELECT o.id FROM orders o INNER JOIN delivery_guy dg ON dg.id = o.driver_id
         WHERE o.id = ? AND dg.user_id = ?
         AND o.status IN ('driver_assigned','picked_up','in_transit','arrived')`,
        [req.body?.[fieldName], req.auth.id]
      );
      if (!rows[0]) return res.status(403).json({ message: "Not assigned to this active delivery" });
      next();
    } catch (error) {
      res.status(500).json({ message: error.message || "Could not verify driver assignment" });
    }
  };
}

module.exports = {
  extractToken,
  requireAuth,
  requireRole,
  requireSelfParam,
  requireSelfBody,
  requireOrderAccessParam,
  requireAssignedDriverOrderBody,
};
