const db = require("../config/db");
const { getTimestampField, mapTimestampFields } = require("../utils/timestampFields");
const { canSendChat, isParticipant, enrichOrderForMessaging } = require("../utils/orderChatAccess");
const { emitToUser, emitToOrder } = require("../utils/socketHub");

exports.sendMessage = (req, res) => {
  const { order_id, sender_id, receiver_id, message } = req.body;
  const oid = order_id != null ? Number(order_id) : NaN;
  const sid = req.auth.id;
  const rid = receiver_id != null ? Number(receiver_id) : NaN;
  const text = message != null ? String(message).trim() : "";

  if (!order_id || Number.isNaN(oid) || Number.isNaN(sid) || Number.isNaN(rid) || !text) {
    return res.status(400).json({ message: "order_id, sender_id, receiver_id, and message are required" });
  }

  db.query("SELECT * FROM orders WHERE id = ?", [oid], (err, orows) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!orows[0]) return res.status(404).json({ message: "Order not found" });

    enrichOrderForMessaging(orows[0], (e0, order) => {
      if (e0) return res.status(500).json({ message: e0.message });

      if (!isParticipant(order, sid)) {
        return res.status(403).json({ message: "Sender is not a participant on this order" });
      }
      if (!isParticipant(order, rid)) {
        return res.status(403).json({ message: "Receiver is not a participant on this order" });
      }
      if (!canSendChat(order, sid, rid)) {
        return res.status(403).json({ message: "Chat is not allowed for this order state or party pair" });
      }

      db.query(
        "INSERT INTO messages (order_id, sender_id, receiver_id, message, is_read) VALUES (?, ?, ?, ?, 0)",
        [oid, sid, rid, text],
        (e2, ins) => {
          if (e2) return res.status(500).json({ message: e2.message });
          const row = {
            id: ins.insertId,
            order_id: oid,
            sender_id: sid,
            receiver_id: rid,
            message: text,
            is_read: 0,
            created_at: new Date().toISOString(),
          };
          const payload = { orderId: oid, message: row };
          emitToUser(rid, "orderChatMessage", payload);
          emitToOrder(oid, "orderChatMessage", payload);
          res.status(201).json({ message: "Sent", ...row });
        }
      );
    });
  });
};

exports.getMessagesByOrder = (req, res) => {
  const orderId = Number(req.params.orderId);
  const userId = req.auth.id;
  if (!req.params.orderId || Number.isNaN(orderId)) {
    return res.status(400).json({ message: "orderId param required" });
  }

  db.query("SELECT * FROM orders WHERE id = ?", [orderId], (err, orows) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!orows[0]) return res.status(404).json({ message: "Order not found" });

    enrichOrderForMessaging(orows[0], (e0, order) => {
      if (e0) return res.status(500).json({ message: e0.message });

      if (!isParticipant(order, userId)) {
        return res.status(403).json({ message: "Not allowed to view this order thread" });
      }
      const st = String(order.status || "");
      if (st === "pending") {
        return res.status(403).json({ message: "Chat is not available until the supplier accepts the order" });
      }

      db.query(
        `SELECT id, order_id, sender_id, receiver_id, message, is_read, created_at
         FROM messages
         WHERE order_id = ?
         ORDER BY id ASC`,
        [orderId],
        (e2, rows) => {
          if (e2) return res.status(500).json({ message: e2.message });
          db.query(
            "UPDATE messages SET is_read = 1 WHERE order_id = ? AND receiver_id = ? AND is_read = 0",
            [orderId, userId],
            () => res.json(rows)
          );
        }
      );
    });
  });
};

exports.listConversationsForUser = (req, res) => {
  const userId = req.params.userId != null ? Number(req.params.userId) : NaN;
  if (Number.isNaN(userId)) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  getTimestampField('orders', 'updated')
    .then(updatedField => {
      const selectFields = [
        'DISTINCT o.id AS order_id', 'o.status', 'o.brand', 'o.size',
        'o.customer_id', 'o.supplier_id', 'dg.user_id AS delivery_user_id', 'o.driver_id AS delivery_guy_id'
      ];
      if (updatedField) selectFields.push(`o.${updatedField}`);
      
      const sql = `
        SELECT ${selectFields.join(', ')}
        FROM messages m
        INNER JOIN orders o ON o.id = m.order_id
        LEFT JOIN delivery_guy dg ON dg.id = o.driver_id
        WHERE (
          o.customer_id = ?
          OR o.supplier_id = ?
          OR dg.user_id = ?
        )
        ORDER BY ${updatedField ? `o.${updatedField}` : 'o.id'} DESC
        LIMIT 100
      `;

      return db.query(sql, [userId, userId, userId]);
    })
    .then(([rows]) => {
      const mappedRows = rows.map(row => mapTimestampFields('orders', row));
      
      res.json({ orders: mappedRows });
    })
    .catch((err) => {
      console.error("Error getting orders for chat:", err);
      res.status(500).json({ message: "Database error: " + err.message });
    });
};
