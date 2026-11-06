const db = require("../config/db");

function canSendChat(userId, orderId, callback) {
  // Check if user is participant in the order
  db.query(
    "SELECT COUNT(*) as count FROM orders WHERE id = ? AND (customer_id = ? OR supplier_id = ? OR delivery_guy_id = ?)",
    [orderId, userId, userId, userId],
    (err, rows) => {
      if (err) return callback(err);
      callback(null, rows[0].count > 0);
    }
  );
}

function isParticipant(userId, orderId, callback) {
  canSendChat(userId, orderId, callback);
}

function enrichOrderForMessaging(orderId, callback) {
  // Get order details for messaging
  db.query(
    `SELECT o.*, c.full_name as customer_name, s.business_name as supplier_name, dg.full_name as delivery_guy_name
     FROM orders o
     LEFT JOIN customers c ON o.customer_id = c.user_id
     LEFT JOIN suppliers s ON o.supplier_id = s.user_id
     LEFT JOIN delivery_guy dg ON o.delivery_guy_id = dg.user_id
     WHERE o.id = ?`,
    [orderId],
    (err, rows) => {
      if (err) return callback(err);
      callback(null, rows[0] || null);
    }
  );
}

module.exports = {
  canSendChat,
  isParticipant,
  enrichOrderForMessaging
};