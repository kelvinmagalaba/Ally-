const db = require("../config/db");
const { broadcastOrderStatus, emitToUser, emitToOrder } = require("../utils/socketHub");
const { haversineKm } = require("../utils/geo");
const deliveryAccessCodeStore = require("../utils/deliveryAccessCodeStore");
const { createNotification } = require("../services/notificationService");

/** Join delivery_guy by PK: orders.driver_id = delivery_guy.id */
const ORDER_PROFILE_JOINS = `
  LEFT JOIN users scu ON o.customer_id = scu.id
  LEFT JOIN customers sc ON sc.user_id = o.customer_id
  LEFT JOIN users ssu ON o.supplier_id = ssu.id
  LEFT JOIN suppliers sp ON sp.user_id = o.supplier_id
  LEFT JOIN delivery_guy dg ON dg.id = o.driver_id
  LEFT JOIN users dgu ON dgu.id = dg.user_id
`;

const ORDER_PARTY_SELECT = `
  COALESCE(sc.full_name, scu.email) AS customer_name,
  scu.phone AS customer_phone,
  COALESCE(sp.full_name, ssu.email) AS supplier_name,
  ssu.phone AS supplier_phone,
  dg.id AS delivery_guy_id,
  dg.user_id AS delivery_user_id,
  COALESCE(NULLIF(TRIM(dg.full_name), ''), dgu.email) AS delivery_name,
  COALESCE(NULLIF(TRIM(dg.phone), ''), dgu.phone) AS driver_phone
`;

const pendingPaySub = "CAST((o.payment_status = 'submitted') AS UNSIGNED) AS pending_payment_count";

function parseDeliveryGuyId(body) {
  const v =
    body.delivery_guy_id != null
      ? body.delivery_guy_id
      : body.delivery_id != null
        ? body.delivery_id
        : body.driver_id;
  return v != null ? Number(v) : NaN;
}

exports.createOrder = async (req, res) => {
  if (req.auth.role !== "customer" && req.auth.role !== "admin") {
    return res.status(403).json({ message: "Only customers can place orders" });
  }
  const quoteId = String(req.body.quote_id || "").trim();
  const idempotencyKey = String(req.headers["idempotency-key"] || req.body.idempotency_key || "").trim().slice(0, 128);
  if (!quoteId || !idempotencyKey) {
    return res.status(400).json({ message: "A valid quote_id and Idempotency-Key are required" });
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query(
      "SELECT * FROM orders WHERE customer_id = ? AND idempotency_key = ? LIMIT 1",
      [req.auth.id, idempotencyKey]
    );
    if (existing[0]) {
      await connection.commit();
      return res.json({ message: "Order already created", orderId: existing[0].id, status: existing[0].status, idempotentReplay: true });
    }
    const [quoteRows] = await connection.query(
      `SELECT * FROM order_quotes WHERE id = ? AND customer_id = ?
       AND consumed_at IS NULL AND expires_at > NOW() FOR UPDATE`,
      [quoteId, req.auth.id]
    );
    const quote = quoteRows[0];
    if (!quote) {
      await connection.rollback();
      return res.status(409).json({ message: "Quote is missing, expired, or already used. Request a fresh quote." });
    }
    const forFriend = req.body.is_for_friend ? 1 : 0;
    const rname = req.body.recipient_name ? String(req.body.recipient_name).slice(0, 255) : null;
    const rphone = req.body.recipient_phone ? String(req.body.recipient_phone).slice(0, 64) : null;
    const address = req.body.delivery_address ? String(req.body.delivery_address).slice(0, 512) : null;
    const [result] = await connection.query(
      `INSERT INTO orders
       (customer_id, supplier_id, delivery_id, driver_id, brand, size, quantity, order_type,
        price, unit_price, item_subtotal, delivery_fee, discount, total_amount, status,
        customer_lat, customer_lng, road_distance_km, route_duration_seconds, route_provider,
        pricing_rule_id, pricing_rule_version, quote_id, quote_timestamp, idempotency_key,
        is_for_friend, recipient_name, recipient_phone, delivery_address,
        location_selected_method, location_accuracy_meters)
       VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_seller',
        ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?)`,
      [req.auth.id, quote.supplier_id, quote.brand, quote.size, quote.quantity, quote.order_type,
        quote.total_amount, quote.unit_price, quote.subtotal, quote.delivery_fee, quote.discount, quote.total_amount,
        quote.destination_lat, quote.destination_lng, quote.road_distance_km, quote.route_duration_seconds,
        quote.route_provider, quote.pricing_rule_id, quote.pricing_rule_version, quote.id, idempotencyKey,
        forFriend, rname, rphone, address, String(req.body.location_selected_method || "manual").slice(0, 32),
        req.body.location_accuracy_meters == null ? null : Number(req.body.location_accuracy_meters)]
    );
    await connection.query("UPDATE order_quotes SET consumed_at = NOW() WHERE id = ?", [quote.id]);
    await connection.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, actor_user_id)
       VALUES (?, NULL, 'pending_seller', ?)`,
      [result.insertId, req.auth.id]
    );
    await connection.commit();
    const payload = {
      orderId: result.insertId,
      status: "pending_seller",
      supplier_id: Number(quote.supplier_id),
      customer_id: req.auth.id,
      brand: quote.brand,
      size: quote.size,
      quantity: Number(quote.quantity),
      total: Number(quote.total_amount),
    };
    await createNotification({
      userId: quote.supplier_id,
      orderId: result.insertId,
      type: "new_order",
      title: "New cooking gas order",
      message: `${quote.quantity} × ${quote.brand} ${quote.size} kg — TSh ${Number(quote.total_amount).toLocaleString("en-TZ")}`,
      deepLink: `orders/${result.insertId}`,
      payload,
    });
    emitToUser(quote.supplier_id, "newOrder", payload);
    broadcastOrderStatus(result.insertId, payload);
    res.status(201).json({ message: "Order created", ...payload });
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") {
      const [rows] = await db.query("SELECT id, status FROM orders WHERE customer_id = ? AND idempotency_key = ?", [req.auth.id, idempotencyKey]);
      if (rows[0]) return res.json({ message: "Order already created", orderId: rows[0].id, status: rows[0].status, idempotentReplay: true });
    }
    res.status(500).json({ message: error.message || "Could not create order" });
  } finally {
    connection.release();
  }
};

exports.getOrders = (req, res) => {
  const role = req.auth.role;
  const uid = Number(req.auth.id);

  if (role === "customer") {
    return db.query(
      `SELECT o.*, 
        ${ORDER_PARTY_SELECT},
        ${pendingPaySub}
       FROM orders o
       ${ORDER_PROFILE_JOINS}
       WHERE o.customer_id = ?
       ORDER BY o.created_at DESC`,
      [uid],
      (err, rows) => (err ? res.status(500).json({ message: err.message }) : res.json(rows))
    );
  }

  if (role === "supplier") {
    return db.query(
      `SELECT o.*, 
        ${ORDER_PARTY_SELECT},
        ${pendingPaySub}
       FROM orders o
       ${ORDER_PROFILE_JOINS}
       WHERE (o.supplier_id = ? AND o.status NOT IN ('delivered','completed','cancelled'))
          OR (o.supplier_id IS NULL AND o.status = 'pending')
       ORDER BY o.created_at DESC`,
      [uid],
      (err, rows) => (err ? res.status(500).json({ message: err.message }) : res.json(rows))
    );
  }

  if (role === "driver" || role === "delivery_guy") {
    return db.query(
      `SELECT o.*, 
        ${ORDER_PARTY_SELECT}
       FROM orders o
       ${ORDER_PROFILE_JOINS}
       WHERE EXISTS (SELECT 1 FROM delivery_guy dg2 WHERE dg2.user_id = ? AND dg2.id = o.driver_id)
       ORDER BY o.created_at DESC`,
      [uid],
      (err, rows) => (err ? res.status(500).json({ message: err.message }) : res.json(rows))
    );
  }

  if (role === "admin") {
    return db.query(
      `SELECT o.*, 
        ${ORDER_PARTY_SELECT}
       FROM orders o
       ${ORDER_PROFILE_JOINS}
       ORDER BY o.created_at DESC`,
      (err, rows) => (err ? res.status(500).json({ message: err.message }) : res.json(rows))
    );
  }

  res.status(400).json({ message: "Invalid role" });
};

exports.getOrderById = (req, res) => {
  const id = req.params.id;
  db.query(
    `SELECT o.*, 
      ${ORDER_PARTY_SELECT},
      sc.latitude AS customer_lat_user, sc.longitude AS customer_lng_user,
      sp.latitude AS supplier_lat, sp.longitude AS supplier_lng
     FROM orders o
     ${ORDER_PROFILE_JOINS}
     WHERE o.id = ?`,
    [id],
    (err, rows) => {
      if (err) return res.status(500).json({ message: err.message });
      if (!rows[0]) return res.status(404).json({ message: "Order not found" });
      const order = rows[0];
      const allowed =
        req.auth.role === "admin" ||
        Number(order.customer_id) === req.auth.id ||
        Number(order.supplier_id) === req.auth.id ||
        Number(order.delivery_user_id) === req.auth.id;
      if (!allowed) return res.status(403).json({ message: "You cannot view this order" });
      res.json(rows[0]);
    }
  );
};

exports.acceptOrder = async (req, res) => {
  const orderId = req.params.id;
  if (req.auth.role !== "supplier" && req.auth.role !== "admin") return res.status(403).json({ message: "Only the selected seller can accept an order" });
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query("SELECT * FROM orders WHERE id = ? FOR UPDATE", [orderId]);
    const order = rows[0];
    if (!order) {
      await connection.rollback();
      return res.status(404).json({ message: "Order not found" });
    }
    if (!["pending", "pending_seller"].includes(order.status)) {
      await connection.rollback();
      return res.status(409).json({ message: "Order is not pending" });
    }
    const supplierId = req.auth.role === "admin" ? Number(order.supplier_id) : req.auth.id;
    if (!Number.isFinite(supplierId) || (req.auth.role !== "admin" && Number(order.supplier_id) !== supplierId)) {
      await connection.rollback();
      return res.status(403).json({ message: "This order belongs to another seller" });
    }
    const [products] = await connection.query(
      `SELECT stock_quantity, available FROM gas_prices
       WHERE supplier_id = ? AND brand = ? AND size = ? LIMIT 1 FOR UPDATE`,
      [supplierId, order.brand, order.size]
    );
    const product = products[0];
    if (!product || !product.available || Number(product.stock_quantity) < Number(order.quantity)) {
      await connection.rollback();
      return res.status(409).json({ message: "Insufficient cooking gas stock to accept this order" });
    }
    await connection.query(
      `UPDATE gas_prices SET stock_quantity = stock_quantity - ?
       WHERE supplier_id = ? AND brand = ? AND size = ?`,
      [order.quantity, supplierId, order.brand, order.size]
    );
    await connection.query(
      `UPDATE gas_prices SET available = CASE WHEN stock_quantity > 0 THEN 1 ELSE 0 END
       WHERE supplier_id = ? AND brand = ? AND size = ?`,
      [supplierId, order.brand, order.size]
    );
    const [updated] = await connection.query(
      `UPDATE orders SET status = 'accepted', accepted_at = NOW(), inventory_deducted = 1
       WHERE id = ? AND status IN ('pending','pending_seller')`,
      [orderId]
    );
    if (!updated.affectedRows) {
      await connection.rollback();
      return res.status(409).json({ message: "Order changed while it was being accepted" });
    }
    await connection.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, actor_user_id)
       VALUES (?, ?, 'accepted', ?)`,
      [orderId, order.status, req.auth.id]
    );
    await connection.commit();

    broadcastOrderStatus(orderId, { orderId: Number(orderId), status: "accepted" });
    await createNotification({
      userId: order.customer_id,
      orderId: Number(orderId),
      type: "order_accepted",
      title: "Seller accepted your order",
      message: "The seller is now finding an available delivery driver.",
      deepLink: `orders/${orderId}`,
    });
    res.json({ message: "Order accepted" });
  } catch (err) {
    await connection.rollback();
    return res.status(500).json({ message: err.message });
  } finally {
    connection.release();
  }
};

/** Driver self-assign: body { user_id } — must match delivery_guy.user_id */
exports.claimDelivery = async (req, res) => {
  const orderId = req.params.id;
  const rawUid =
    req.body.user_id != null ? req.body.user_id : req.body.delivery_id != null ? req.body.delivery_id : null;
  const userId = rawUid != null ? Number(rawUid) : NaN;
  if (Number.isNaN(userId)) {
    return res.status(400).json({ message: "user_id required" });
  }

  try {
    const [rows] = await db.query("SELECT * FROM orders WHERE id = ?", [orderId]);
    
    if (!rows[0]) return res.status(404).json({ message: "Order not found" });
    const o = rows[0];
    if (o.status !== "accepted" || o.driver_id != null) {
      return res.status(400).json({ message: "Order is not available to claim (must be accepted with no driver)" });
    }

    const [dgRows] = await db.query(
      "SELECT id, status FROM delivery_guy WHERE user_id = ? LIMIT 1",
      [userId]
    );
    
    const dg = dgRows && dgRows[0];
    if (!dg) return res.status(400).json({ message: "No delivery profile for this user" });
    if (String(dg.status) !== "available") {
      return res.status(400).json({ message: "Set your status to available before claiming orders" });
    }

    const [upDg] = await db.query(
      "UPDATE delivery_guy SET status = 'busy' WHERE id = ? AND status = 'available'",
      [dg.id]
    );
    
    if (!upDg.affectedRows) {
      return res.status(400).json({ message: "Could not lock delivery profile (not available)" });
    }
    
    const [upOr] = await db.query(
      "UPDATE orders SET driver_id = ?, status = 'driver_assigned' WHERE id = ? AND status = 'accepted' AND driver_id IS NULL",
      [dg.id, orderId]
    );
    
    if (!upOr.affectedRows) {
      await db.query("UPDATE delivery_guy SET status = 'available' WHERE id = ?", [dg.id]);
      return res.status(400).json({ message: "Order was taken by another driver" });
    }
    
    const payload = {
      orderId: Number(orderId),
      status: "driver_assigned",
      delivery_guy_id: dg.id,
      delivery_user_id: userId,
    };
    broadcastOrderStatus(orderId, payload);
    emitToUser(userId, "orderStatusUpdate", payload);
    res.json({ message: "Delivery claimed", delivery_guy_id: dg.id });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.startPickingUp = async (req, res) => {
  const orderId = req.params.id;
  const raw = req.body.user_id != null ? req.body.user_id : req.body.delivery_id;
  const userId = raw != null ? Number(raw) : NaN;
  if (Number.isNaN(userId)) return res.status(400).json({ message: "user_id required" });

  try {
    const [result] = await db.query(
      `UPDATE orders o
       SET o.status = 'picking_up'
       WHERE o.id = ? AND o.driver_id = (SELECT dg.id FROM delivery_guy dg WHERE dg.user_id = ?)
       AND o.status = 'driver_assigned'`,
      [userId, orderId]
    );
    
    if (!result.affectedRows) return res.status(400).json({ message: "Cannot start pickup (wrong state or not your order)" });
    broadcastOrderStatus(orderId, { orderId: Number(orderId), status: "picking_up" });
    res.json({ message: "Status: picking_up — en route to supplier" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

/** picking_up → delivering (heading to customer) */
exports.startDelivery = async (req, res) => {
  const orderId = req.params.id;
  const raw = req.body.user_id != null ? req.body.user_id : req.body.delivery_id;
  const userId = raw != null ? Number(raw) : NaN;
  if (Number.isNaN(userId)) return res.status(400).json({ message: "user_id required" });

  try {
    const [result] = await db.query(
      `UPDATE orders o
       INNER JOIN delivery_guy dg ON dg.id = o.driver_id AND dg.user_id = ?
       SET o.status = 'delivering'
       WHERE o.id = ? AND o.status = 'picking_up'`,
      [userId, orderId]
    );
    
    if (!result.affectedRows) return res.status(400).json({ message: "Cannot start delivery (must be picking_up)" });
    broadcastOrderStatus(orderId, { orderId: Number(orderId), status: "delivering" });
    res.json({ message: "Status: delivering — en route to customer" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.completeOrder = async (req, res) => {
  const orderId = req.params.id;
  const raw = req.body.user_id != null ? req.body.user_id : req.body.delivery_id;
  const userId = raw != null ? Number(raw) : NaN;
  if (Number.isNaN(userId)) return res.status(400).json({ message: "user_id required" });

  try {
    const [rows] = await db.query(
      `SELECT o.driver_id, o.receipt_code FROM orders o
       INNER JOIN delivery_guy dg ON dg.id = o.driver_id AND dg.user_id = ?
       WHERE o.id = ? AND o.status = 'delivering'`,
      [userId, orderId]
    );
    
    if (!rows || !rows[0]) return res.status(400).json({ message: "Cannot complete order" });
    if (!rows[0].receipt_code) {
      return res.status(400).json({ message: "Payment not completed yet" });
    }
    const dgPk = rows[0].driver_id;

    const [result] = await db.query(
      "UPDATE orders SET status = 'completed' WHERE id = ? AND status = 'delivering'",
      [orderId]
    );
    
    if (!result.affectedRows) return res.status(400).json({ message: "Cannot complete order" });
    
    await db.query("UPDATE delivery_guy SET status = 'available' WHERE id = ?", [dgPk]);
    broadcastOrderStatus(orderId, { orderId: Number(orderId), status: "completed" });
    res.json({ message: "Order completed" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.cancelOrder = async (req, res) => {
  const orderId = req.params.id;
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [orderRows] = await connection.query("SELECT * FROM orders WHERE id = ? FOR UPDATE", [orderId]);
    const order = orderRows[0];
    if (!order) {
      await connection.rollback();
      return res.status(404).json({ message: "Order not found" });
    }
    const ownsOrder = req.auth.role === "admin" || Number(order.customer_id) === req.auth.id || Number(order.supplier_id) === req.auth.id;
    if (!ownsOrder) {
      await connection.rollback();
      return res.status(403).json({ message: "Not allowed to cancel this order" });
    }
    if (["delivered", "completed", "cancelled"].includes(String(order.status))) {
      await connection.rollback();
      return res.status(400).json({ message: "Cannot cancel this order" });
    }
    const [r] = await connection.query(
      "UPDATE orders SET status = 'cancelled', cancelled_at = NOW() WHERE id = ? AND status NOT IN ('delivered','completed','cancelled')",
      [orderId]
    );
    if (!r.affectedRows) {
      await connection.rollback();
      return res.status(409).json({ message: "Order status changed; reload and try again" });
    }
    await connection.query(
      `UPDATE delivery_guy dg
       INNER JOIN orders o ON o.id = ? AND o.driver_id = dg.id
       SET dg.status = 'available'`,
      [orderId]
    );
    if (order.inventory_deducted) {
      await connection.query(
        `UPDATE gas_prices SET stock_quantity = stock_quantity + ?, available = 1
         WHERE supplier_id = ? AND brand = ? AND size = ?`,
        [order.quantity, order.supplier_id, order.brand, order.size]
      );
      await connection.query("UPDATE orders SET inventory_deducted = 0 WHERE id = ?", [orderId]);
    }
    await connection.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, actor_user_id, reason)
       VALUES (?, ?, 'cancelled', ?, ?)`,
      [orderId, order.status, req.auth.id, String(req.body.reason || "Cancelled by an authorized account").slice(0, 500)]
    );
    await connection.commit();

    broadcastOrderStatus(orderId, { orderId: Number(orderId), status: "cancelled" });
    const recipients = new Set([Number(order.customer_id), Number(order.supplier_id)]);
    if (order.driver_id) {
      const [driverRows] = await db.query("SELECT user_id FROM delivery_guy WHERE id = ?", [order.driver_id]);
      if (driverRows[0]) recipients.add(Number(driverRows[0].user_id));
    }
    recipients.delete(Number(req.auth.id));
    await Promise.all([...recipients].filter(Number.isFinite).map((userId) => createNotification({
      userId,
      orderId: Number(orderId),
      type: "order_cancelled",
      title: "Cooking gas order cancelled",
      message: `Order #${orderId} was cancelled.`,
      deepLink: `orders/${orderId}`,
    })));
    res.json({ message: "Order cancelled" });
  } catch (err) {
    await connection.rollback();
    return res.status(500).json({ message: err.message });
  } finally {
    connection.release();
  }
};

exports.sendCustomerLocationToSeller = async (req, res) => {
  const orderId = req.params.id;
  const { customer_id, customer_lat, customer_lng } = req.body;
  if (!customer_id || customer_lat == null || customer_lng == null) {
    return res.status(400).json({ message: "customer_id, customer_lat, customer_lng required" });
  }
  const lat = Number(customer_lat);
  const lng = Number(customer_lng);
  
  try {
    const [rows] = await db.query("SELECT * FROM orders WHERE id = ?", [orderId]);
    
    if (!rows[0]) return res.status(404).json({ message: "Order not found" });
    if (Number(rows[0].customer_id) !== Number(customer_id)) {
      return res.status(403).json({ message: "Not your order" });
    }
    
    await db.query(
      "UPDATE orders SET customer_lat = ?, customer_lng = ? WHERE id = ?",
      [lat, lng, orderId]
    );
    
    const payload = { orderId: Number(orderId), customer_lat: lat, customer_lng: lng };
    emitToUser(rows[0].supplier_id, "customerLocation", payload);
    res.json({ message: "Location sent to seller" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.generateDeliveryAccessCode = async (req, res) => {
  const orderId = Number(req.params.id);
  const supplierId = Number(req.body.supplier_id);
  if (!Number.isFinite(orderId) || !Number.isFinite(supplierId)) {
    return res.status(400).json({ message: "order id and supplier_id are required" });
  }

  try {
    const [rows] = await db.query("SELECT id, supplier_id, customer_lat, customer_lng FROM orders WHERE id = ?", [orderId]);
    const order = rows && rows[0];
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (Number(order.supplier_id) !== supplierId) {
      return res.status(403).json({ message: "Not your order" });
    }
    const row = deliveryAccessCodeStore.setCode(orderId, supplierId);
    emitToUser(supplierId, "deliveryAccessCodeGenerated", {
      orderId,
      code: row.code,
      expiresAt: row.expiresAt,
    });
    res.json({
      message: "Delivery access code generated",
      orderId,
      code: row.code,
      expiresAt: row.expiresAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.verifyDeliveryAccessCode = async (req, res) => {
  const orderId = Number(req.body.order_id);
  const userId = Number(req.body.driver_user_id);
  const code = String(req.body.code || "").trim();
  if (!Number.isFinite(orderId) || !Number.isFinite(userId) || !code) {
    return res.status(400).json({ message: "order_id, driver_user_id and code are required" });
  }

  const check = deliveryAccessCodeStore.verify(orderId, code);
  if (!check.ok) {
    return res.status(400).json({ message: check.reason === "missing" ? "No active code for this order" : "Invalid code" });
  }

  try {
    const [rows] = await db.query(
      `SELECT o.id, o.customer_lat, o.customer_lng, o.supplier_id, o.customer_id
       FROM orders o
       INNER JOIN delivery_guy dg ON dg.id = o.driver_id
       WHERE o.id = ? AND dg.user_id = ?`,
      [orderId, userId]
    );
    const order = rows && rows[0];
    if (!order) return res.status(403).json({ message: "Order is not assigned to this driver" });

    res.json({
      message: "Code verified",
      orderId,
      customer_lat: order.customer_lat != null ? Number(order.customer_lat) : null,
      customer_lng: order.customer_lng != null ? Number(order.customer_lng) : null,
      supplier_id: order.supplier_id,
      customer_id: order.customer_id,
      unlockExpiresAt: check.row.expiresAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

async function assignDeliveryGuyCore(orderId, supplierId, deliveryGuyId, res) {
  try {
    const [rows] = await db.query("SELECT * FROM orders WHERE id = ?", [orderId]);
    
    if (!rows[0]) return res.status(404).json({ message: "Order not found" });
    const o = rows[0];
    if (Number(o.supplier_id) !== Number(supplierId)) {
      return res.status(403).json({ message: "Not your order to dispatch" });
    }
    const allowed = ["accepted", "processing_payment"];
    if (!allowed.includes(String(o.status))) {
      return res.status(400).json({ message: "Order must be accepted (or awaiting payment confirmation) to assign a driver" });
    }
    if (Number.isNaN(deliveryGuyId) || deliveryGuyId <= 0) {
      return res.status(400).json({ message: "Invalid delivery_guy id" });
    }

    const prev = o.driver_id != null ? Number(o.driver_id) : null;

    const finishAssign = async () => {
      const [dgRows] = await db.query(
        "SELECT id, status, user_id FROM delivery_guy WHERE id = ? LIMIT 1",
        [deliveryGuyId]
      );
      
      const dg = dgRows && dgRows[0];
      if (!dg) return res.status(400).json({ message: "Delivery guy not found" });
      if (String(dg.status) !== "available") {
        return res.status(400).json({ message: "Delivery guy is not available" });
      }

      const [upBusy] = await db.query(
        "UPDATE delivery_guy SET status = 'busy' WHERE id = ? AND status = 'available'",
        [deliveryGuyId]
      );
      
      if (!upBusy.affectedRows) {
        return res.status(400).json({ message: "Delivery guy became unavailable â retry" });
      }

      const nextStatus = "driver_assigned";
      await db.query(
        "UPDATE orders SET driver_id = ?, status = ? WHERE id = ?",
        [deliveryGuyId, nextStatus, orderId]
      );

      const payload = {
        orderId: Number(orderId),
        status: nextStatus,
        delivery_guy_id: deliveryGuyId,
        delivery_user_id: dg.user_id,
      };
      broadcastOrderStatus(orderId, payload);
      emitToUser(dg.user_id, "orderStatusUpdate", payload);
      res.json({ message: "Driver assigned to order", status: nextStatus, delivery_guy_id: deliveryGuyId });
    };

    if (prev && prev !== deliveryGuyId) {
      await db.query("UPDATE delivery_guy SET status = 'available' WHERE id = ?", [prev]);
      await finishAssign();
    } else if (prev === deliveryGuyId) {
      return res.json({ message: "Already assigned to this delivery guy", delivery_guy_id: deliveryGuyId });
    } else {
      await finishAssign();
    }
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

exports.assignDeliveryGuyToOrder = async (req, res) => {
  const orderId = req.params.id;
  const { supplier_id } = req.body;
  const deliveryGuyId = parseDeliveryGuyId(req.body);
  if (!supplier_id || Number.isNaN(deliveryGuyId)) {
    return res.status(400).json({ message: "supplier_id and delivery_guy id (delivery_guy_id, delivery_id, or driver_id) required" });
  }
  await assignDeliveryGuyCore(orderId, supplier_id, deliveryGuyId, res);
};

/** Nearest available delivery_guy with GPS; same assignment rules as manual */
exports.autoAssignDeliveryGuy = (req, res) => {
  const orderId = req.params.id;
  const { supplier_id } = req.body;
  if (!supplier_id) return res.status(400).json({ message: "supplier_id required" });

  db.query(
    `SELECT o.*, sp.latitude AS sup_lat, sp.longitude AS sup_lng
     FROM orders o
     LEFT JOIN suppliers sp ON sp.user_id = o.supplier_id
     WHERE o.id = ?`,
    [orderId],
    (err, rows) => {
      if (err) return res.status(500).json({ message: err.message });
      if (!rows[0]) return res.status(404).json({ message: "Order not found" });
      const o = rows[0];
      if (Number(o.supplier_id) !== Number(supplier_id)) {
        return res.status(403).json({ message: "Not your order to dispatch" });
      }
      const allowed = ["accepted", "processing_payment"];
      if (!allowed.includes(String(o.status))) {
        return res.status(400).json({ message: "Order is not in a state that allows driver assignment" });
      }

      let refLat = o.sup_lat != null ? Number(o.sup_lat) : null;
      let refLng = o.sup_lng != null ? Number(o.sup_lng) : null;
      if (refLat == null || refLng == null || !Number.isFinite(refLat) || !Number.isFinite(refLng)) {
        return res.status(400).json({ message: "Supplier shop GPS missing — set profile coordinates first" });
      }

      db.query(
        `SELECT dg.id, dg.latitude, dg.longitude, dg.status
         FROM delivery_guy dg
         INNER JOIN users u ON u.id = dg.user_id AND u.role IN ('delivery_guy', 'driver')
         WHERE dg.status = 'available'
           AND dg.latitude IS NOT NULL AND dg.longitude IS NOT NULL`,
        [],
        (e2, candidates) => {
          if (e2) return res.status(500).json({ message: e2.message });
          if (!candidates || !candidates.length) {
            return res.status(404).json({ message: "No available delivery partners with GPS in the system" });
          }
          let best = null;
          let bestKm = Infinity;
          for (const c of candidates) {
            const km = haversineKm(refLat, refLng, Number(c.latitude), Number(c.longitude));
            if (km < bestKm) {
              bestKm = km;
              best = c;
            }
          }
          if (!best) return res.status(404).json({ message: "No suitable driver" });
          assignDeliveryGuyCore(orderId, supplier_id, Number(best.id), res);
        }
      );
    }
  );
};

exports.updateDeliveryStatus = (req, res) => {
  const orderId = req.params.id;
  const rawDu = req.body.user_id != null ? req.body.user_id : req.body.delivery_id;
  const userId = rawDu != null ? Number(rawDu) : NaN;
  const { phase } = req.body;
  if (Number.isNaN(userId) || !phase) {
    return res.status(400).json({ message: "user_id and phase required (at_seller | at_customer)" });
  }
  db.query(
    `SELECT o.*, dg.user_id AS dg_uid FROM orders o
     LEFT JOIN delivery_guy dg ON dg.id = o.driver_id
     WHERE o.id = ?`,
    [orderId],
    (err, rows) => {
      if (err) return res.status(500).json({ message: err.message });
      if (!rows[0]) return res.status(404).json({ message: "Order not found" });
      const o = rows[0];
      if (Number(o.dg_uid) !== userId) {
        return res.status(403).json({ message: "Not assigned to this delivery" });
      }
      if (phase === "at_seller") {
        if (o.supplier_id) {
          emitToUser(o.supplier_id, "sellerNotificationBell", {
            orderId: Number(orderId),
            title: "Delivery Guy Arrived",
            message: "Delivery Guy Arrived",
            chimes: 4,
          });
        }
        broadcastOrderStatus(orderId, {
          orderId: Number(orderId),
          status: o.status,
          deliveryPhase: "at_seller",
        });
        return res.json({ message: "Seller notified — arrival at shop" });
      }
      if (phase === "at_customer") {
        const arrived = {
          orderId: Number(orderId),
          at: "customer",
          message: "Delivery arrived at customer location",
        };
        emitToOrder(orderId, "deliveryArrived", arrived);
        if (o.customer_id) emitToUser(o.customer_id, "deliveryArrived", arrived);
        if (o.supplier_id) emitToUser(o.supplier_id, "deliveryArrived", arrived);
        broadcastOrderStatus(orderId, {
          orderId: Number(orderId),
          status: o.status,
          deliveryPhase: "at_customer",
        });
        return res.json({ message: "Customer and seller notified — arrival at destination" });
      }
      return res.status(400).json({ message: "Invalid phase" });
    }
  );
};

exports.setOrderTransactionPhone = (req, res) => {
  const orderId = req.params.id;
  const { supplier_id, transaction_phone } = req.body;
  if (!supplier_id || transaction_phone == null || String(transaction_phone).trim() === "") {
    return res.status(400).json({ message: "supplier_id and transaction_phone required" });
  }
  const phone = String(transaction_phone).trim();
  db.query("SELECT * FROM orders WHERE id = ?", [orderId], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!rows[0]) return res.status(404).json({ message: "Order not found" });
    const o = rows[0];
    if (Number(o.supplier_id) !== Number(supplier_id)) {
      return res.status(403).json({ message: "Not your order" });
    }
    const allowed = ["accepted", "pending", "driver_assigned", "picking_up", "delivering", "processing_payment"];
    if (!allowed.includes(String(o.status))) {
      return res.status(400).json({ message: "Cannot set payment number for this order state" });
    }
    db.query("UPDATE orders SET transaction_phone = ? WHERE id = ?", [phone, orderId], (e2) => {
      if (e2) return res.status(500).json({ message: e2.message });
      res.json({ message: "Payment number saved on order" });
    });
  });
};

/**
 * Driver scans the QR (or types the code) at the customer's door.
 * Body: { order_id, driver_user_id, code }   (code is the receipt verify_code OR full QR JSON payload)
 *
 * If the code matches what we stored in receipt_json, mark the order completed,
 * and ring the "delivery success" bell on BOTH the customer's and driver's
 * connected sockets (and seller too).
 */
exports.verifyReceiptCodeAtCustomer = (req, res) => {
  const orderId = Number(req.body.order_id);
  const userId = Number(req.body.driver_user_id);
  const rawCode = String(req.body.code || "").trim();
  if (!Number.isFinite(orderId) || !Number.isFinite(userId) || !rawCode) {
    return res.status(400).json({ message: "order_id, driver_user_id and code are required" });
  }

  // Allow the driver to paste the entire QR JSON payload too.
  let codeToCheck = rawCode;
  try {
    const maybe = JSON.parse(rawCode);
    if (maybe && typeof maybe === "object") {
      codeToCheck = String(maybe.verify_code || maybe.delivery_verification_code || "").trim();
      if (!codeToCheck) codeToCheck = String(maybe.receipt_code || "").trim();
    }
  } catch (_) {
    /* not JSON, treat as raw code */
  }
  if (!codeToCheck) {
    return res.status(400).json({ message: "Invalid code" });
  }

  db.query(
    `SELECT o.*, dg.user_id AS dg_uid
       FROM orders o
       LEFT JOIN delivery_guy dg ON dg.id = o.driver_id
      WHERE o.id = ?`,
    [orderId],
    (err, rows) => {
      if (err) return res.status(500).json({ message: err.message });
      if (!rows[0]) return res.status(404).json({ message: "Order not found" });
      const order = rows[0];
      if (Number(order.dg_uid) !== userId) {
        return res.status(403).json({ message: "Not assigned to this delivery" });
      }
      if (!order.receipt_json) {
        return res
          .status(400)
          .json({ message: "Receipt not generated yet — payment must be confirmed first" });
      }

      let payload = null;
      try {
        payload = JSON.parse(order.receipt_json);
      } catch (_) {
        payload = null;
      }
      if (!payload) {
        return res.status(500).json({ message: "Receipt data corrupt" });
      }

      const expected = String(
        payload.delivery_verification_code || payload.verify_code || ""
      )
        .trim()
        .toUpperCase();
      const expectedReceipt = String(payload.receipt_code || order.receipt_code || "")
        .trim()
        .toUpperCase();

      const got = codeToCheck.toUpperCase();
      const ok = (expected && got === expected) || (expectedReceipt && got === expectedReceipt);

      if (!ok) {
        return res
          .status(400)
          .json({ valid: false, message: "Code does not match the receipt" });
      }

      // Mark completed if not already.
      const completedSql =
        "UPDATE orders SET status = 'completed' WHERE id = ? AND status NOT IN ('completed','cancelled')";
      db.query(completedSql, [orderId], (e2) => {
        if (e2) console.warn("complete order:", e2.message);

        // Ring bells on all 3 parties + the order room.
        const arrivePayload = {
          orderId,
          at: "customer",
          message: "Delivery confirmed — cylinder released",
        };
        emitToOrder(orderId, "deliveryArrived", arrivePayload);
        emitToOrder(orderId, "delivery_success", { orderId });
        if (order.customer_id) {
          emitToUser(order.customer_id, "deliveryArrived", arrivePayload);
          emitToUser(order.customer_id, "deliveryConfirmed", { orderId });
        }
        if (order.supplier_id) {
          emitToUser(order.supplier_id, "deliveryConfirmed", { orderId });
        }
        emitToUser(userId, "deliveryConfirmed", { orderId });
        broadcastOrderStatus(orderId, { orderId, status: "completed" });

        res.json({
          valid: true,
          message: "Cylinder released to customer",
          orderId,
          status: "completed",
        });
      });
    }
  );
};

exports.acceptOrderPost = (req, res) => {
  const { order_id, supplier_id } = req.body;
  if (order_id == null || supplier_id == null) {
    return res.status(400).json({ message: "order_id and supplier_id required" });
  }
  exports.acceptOrder({ params: { id: String(order_id) }, body: { supplier_id } }, res);
};

exports.assignDriverPost = (req, res) => {
  const { order_id, supplier_id, driver_id } = req.body;
  if (order_id == null || supplier_id == null || driver_id == null) {
    return res.status(400).json({ message: "order_id, supplier_id, and driver_id required" });
  }
  exports.assignDeliveryGuyToOrder(
    { params: { id: String(order_id) }, body: { supplier_id, delivery_guy_id: driver_id } },
    res
  );
};
