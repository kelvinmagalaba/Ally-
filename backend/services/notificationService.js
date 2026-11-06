const db = require("../config/db");
const { emitToUser } = require("../utils/socketHub");

async function createNotification({ userId, orderId = null, type, title, message, deepLink = null, payload = {} }) {
  const [result] = await db.query(
    `INSERT INTO notifications (user_id, order_id, type, title, message, deep_link, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, orderId, type, title, message, deepLink, JSON.stringify(payload)]
  );
  const notification = {
    id: result.insertId,
    user_id: Number(userId),
    order_id: orderId == null ? null : Number(orderId),
    type,
    title,
    message,
    deep_link: deepLink,
    payload,
    read_at: null,
    created_at: new Date().toISOString(),
  };
  emitToUser(userId, "notification", notification);
  return notification;
}

module.exports = { createNotification };
