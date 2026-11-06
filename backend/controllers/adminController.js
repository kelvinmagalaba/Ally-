const db = require("../config/db");

exports.stats = (req, res) => {
  db.query("SELECT COUNT(*) AS c FROM users", (e1, u) => {
    if (e1) return res.status(500).json({ message: e1.message });
    db.query("SELECT COUNT(*) AS c FROM orders", (e2, o) => {
      if (e2) return res.status(500).json({ message: e2.message });
      db.query("SELECT COUNT(*) AS c FROM orders WHERE status IN ('pending','pending_seller')", (e3, p) => {
        if (e3) return res.status(500).json({ message: e3.message });
        db.query(
          `SELECT COALESCE(SUM(total_amount),0) AS total FROM orders
           WHERE payment_status = 'confirmed'`,
          (e4, t) => {
            if (e4) return res.status(500).json({ message: e4.message });
            res.json({
              users: u[0].c,
              orders: o[0].c,
              pendingOrders: p[0].c,
              revenue: Number(t[0].total),
            });
          }
        );
      });
    });
  });
};

exports.listUsers = (req, res) => {
  db.query(
    `SELECT u.id, u.email, u.phone, u.role, u.created_at,
            COALESCE(c.full_name, s.full_name, dg.full_name, u.email) AS full_name,
            COALESCE(c.city, s.city, dg.city) AS city,
            CASE WHEN u.role = 'supplier' THEN s.approved
                 WHEN u.role IN ('driver','delivery_guy') THEN dg.approved
                 ELSE 1 END AS approved
     FROM users u
     LEFT JOIN customers c ON c.user_id = u.id AND u.role = 'customer'
     LEFT JOIN suppliers s ON s.user_id = u.id AND u.role = 'supplier'
     LEFT JOIN delivery_guy dg ON dg.user_id = u.id AND u.role IN ('driver','delivery_guy')
     ORDER BY u.id DESC
     LIMIT 200`,
    (err, rows) => (err ? res.status(500).json({ message: err.message }) : res.json(rows))
  );
};

exports.setApproval = async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const approved = req.body.approved === true ? 1 : 0;
    const [users] = await db.query("SELECT id, role FROM users WHERE id = ?", [userId]);
    const account = users[0];
    if (!account || !["supplier", "driver", "delivery_guy"].includes(account.role)) {
      return res.status(404).json({ message: "Seller or driver account not found" });
    }
    if (account.role === "supplier") {
      await db.query("UPDATE suppliers SET approved = ?, verified = ? WHERE user_id = ?", [approved, approved, userId]);
    } else {
      await db.query("UPDATE delivery_guy SET approved = ?, online = CASE WHEN ? = 0 THEN 0 ELSE online END, status = CASE WHEN ? = 0 THEN 'offline' ELSE status END WHERE user_id = ?", [approved, approved, approved, userId]);
    }
    await db.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, 'profile_approval_changed', 'user', ?, ?)`,
      [req.auth.id, String(userId), JSON.stringify({ approved: Boolean(approved), role: account.role })]
    );
    res.json({ success: true, approved: Boolean(approved) });
  } catch (error) {
    res.status(500).json({ message: error.message || "Could not update approval" });
  }
};
