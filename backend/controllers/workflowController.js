const db = require("../config/db");
const { createOrderQuote } = require("../services/pricingService");
const { createNotification } = require("../services/notificationService");
const { issueCode, verifyCode } = require("../services/deliveryVerificationService");
const { broadcastOrderStatus, emitToUser, emitToOrder } = require("../utils/socketHub");
const { haversineKm } = require("../utils/geo");
const { validateCoordinates } = require("../utils/coordinates");
const { getRoadRoute } = require("../services/routingService");

function fail(res, error) {
  const status = Number(error.statusCode || 500);
  if (status >= 500) console.error(error);
  return res.status(status).json({ message: error.message || "Request failed", code: error.code });
}

async function addHistory(connection, orderId, fromStatus, toStatus, actorId, reason = null) {
  await connection.query(
    `INSERT INTO order_status_history (order_id, from_status, to_status, actor_user_id, reason)
     VALUES (?, ?, ?, ?, ?)`,
    [orderId, fromStatus, toStatus, actorId, reason]
  );
  await connection.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json)
     VALUES (?, 'order_status_changed', 'order', ?, ?)`,
    [actorId, String(orderId), JSON.stringify({ from: fromStatus, to: toStatus, reason })]
  );
}

exports.createQuote = async (req, res) => {
  try {
    if (req.auth.role !== "customer" && req.auth.role !== "admin") {
      return res.status(403).json({ message: "Only customers can request an order quote" });
    }
    const quote = await createOrderQuote({
      customerId: req.auth.id,
      supplierId: Number(req.body.supplier_id),
      brand: req.body.brand,
      size: req.body.size,
      quantity: req.body.quantity,
      orderType: req.body.order_type,
      latitude: req.body.customer_lat ?? req.body.latitude,
      longitude: req.body.customer_lng ?? req.body.longitude,
    });
    res.json({ success: true, quote });
  } catch (error) {
    fail(res, error);
  }
};

exports.listNotifications = async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const [rows] = await db.query(
      `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      [req.auth.id, limit]
    );
    res.json({ notifications: rows, unread: rows.filter((row) => !row.read_at).length });
  } catch (error) {
    fail(res, error);
  }
};

exports.markNotificationRead = async (req, res) => {
  try {
    await db.query("UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = ? AND user_id = ?", [req.params.id, req.auth.id]);
    res.json({ success: true });
  } catch (error) {
    fail(res, error);
  }
};

exports.markAllNotificationsRead = async (req, res) => {
  try {
    await db.query("UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE user_id = ?", [req.auth.id]);
    res.json({ success: true });
  } catch (error) {
    fail(res, error);
  }
};

exports.setDriverAvailability = async (req, res) => {
  try {
    const online = req.body.online === true;
    let coords = null;
    if (req.body.latitude != null || req.body.longitude != null) {
      coords = validateCoordinates(req.body.latitude, req.body.longitude);
    }
    const [profiles] = await db.query("SELECT * FROM delivery_guy WHERE user_id = ?", [req.auth.id]);
    const profile = profiles[0];
    if (!profile) return res.status(404).json({ message: "Delivery profile not found" });
    if (online && !profile.approved) return res.status(403).json({ message: "Driver approval is required before going online" });
    const [active] = await db.query(
      `SELECT COUNT(*) AS count FROM orders WHERE driver_id = ?
       AND status IN ('driver_assigned','picked_up','in_transit','arrived')`,
      [profile.id]
    );
    const hasActive = Number(active[0].count) > 0;
    const status = hasActive ? "busy" : online ? "available" : "offline";
    await db.query(
      `UPDATE delivery_guy SET online = ?, status = ?,
       latitude = COALESCE(?, latitude), longitude = COALESCE(?, longitude),
       location_updated_at = CASE WHEN ? IS NULL THEN location_updated_at ELSE NOW() END
       WHERE id = ?`,
      [online ? 1 : 0, status, coords?.lat ?? null, coords?.lng ?? null, coords?.lat ?? null, profile.id]
    );
    res.json({ success: true, online, status });
  } catch (error) {
    fail(res, error);
  }
};

exports.getDriverAvailability = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT online, status, approved, latitude, longitude, location_updated_at
       FROM delivery_guy WHERE user_id = ? LIMIT 1`,
      [req.auth.id]
    );
    if (!rows[0]) return res.status(404).json({ message: "Delivery profile not found" });
    res.json({
      online: Boolean(rows[0].online),
      status: rows[0].status,
      approved: Boolean(rows[0].approved),
      latitude: rows[0].latitude,
      longitude: rows[0].longitude,
      location_updated_at: rows[0].location_updated_at,
    });
  } catch (error) {
    fail(res, error);
  }
};

exports.updateSellerLocation = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const coords = validateCoordinates(req.body.latitude, req.body.longitude);
    const source = ["gps", "manual_pin", "address_search"].includes(req.body.source) ? req.body.source : "manual_pin";
    const accuracy = req.body.accuracy_meters == null ? null : Math.max(0, Number(req.body.accuracy_meters));
    const landmark = req.body.landmark == null ? null : String(req.body.landmark).trim().slice(0, 255);
    await connection.beginTransaction();
    const [rows] = await connection.query("SELECT user_id FROM suppliers WHERE user_id = ? FOR UPDATE", [req.auth.id]);
    if (!rows[0]) {
      await connection.rollback();
      return res.status(404).json({ message: "Seller profile not found" });
    }
    await connection.query(
      `UPDATE suppliers SET latitude = ?, longitude = ?, landmark = COALESCE(?, landmark),
       location_source = ?, location_accuracy_meters = ?, location_updated_at = NOW()
       WHERE user_id = ?`,
      [coords.lat, coords.lng, landmark, source, accuracy, req.auth.id]
    );
    await connection.query(
      `INSERT INTO seller_location_history
       (supplier_id, latitude, longitude, source, accuracy_meters, changed_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.auth.id, coords.lat, coords.lng, source, accuracy, req.auth.id]
    );
    await connection.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, 'seller_location_changed', 'supplier', ?, ?)`,
      [req.auth.id, String(req.auth.id), JSON.stringify({ source, accuracyMeters: accuracy })]
    );
    await connection.commit();
    res.json({ success: true, latitude: coords.lat, longitude: coords.lng, source, landmark });
  } catch (error) {
    await connection.rollback();
    fail(res, error);
  } finally {
    connection.release();
  }
};

exports.listDriverOffers = async (req, res) => {
  try {
    await db.query("UPDATE driver_offers SET status = 'expired' WHERE status = 'pending' AND expires_at <= NOW()");
    const [rows] = await db.query(
      `SELECT dof.id, dof.order_id, dof.status, dof.expires_at, dof.created_at,
        o.brand, o.size, o.quantity, o.order_type, o.delivery_fee,
        sp.full_name AS supplier_name, sp.city AS pickup_city, sp.area AS pickup_area,
        sp.latitude AS pickup_lat, sp.longitude AS pickup_lng
       FROM driver_offers dof
       INNER JOIN delivery_guy dg ON dg.id = dof.driver_id
       INNER JOIN orders o ON o.id = dof.order_id
       INNER JOIN suppliers sp ON sp.user_id = o.supplier_id
       WHERE dg.user_id = ? AND dof.status IN ('pending','accepted')
       ORDER BY dof.created_at DESC`,
      [req.auth.id]
    );
    res.json({ offers: rows });
  } catch (error) {
    fail(res, error);
  }
};

async function sellerOrder(orderId, sellerId) {
  const [rows] = await db.query("SELECT * FROM orders WHERE id = ? AND supplier_id = ? LIMIT 1", [orderId, sellerId]);
  return rows[0] || null;
}

exports.rejectOrder = async (req, res) => {
  const reason = String(req.body.reason || "").trim().slice(0, 512);
  if (!reason) return res.status(400).json({ message: "A rejection reason is required" });
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query("SELECT * FROM orders WHERE id = ? FOR UPDATE", [req.params.id]);
    const order = rows[0];
    if (!order || (req.auth.role !== "admin" && Number(order.supplier_id) !== req.auth.id)) {
      await connection.rollback();
      return res.status(403).json({ message: "Not allowed to reject this order" });
    }
    if (order.status !== "pending_seller" && order.status !== "pending") {
      await connection.rollback();
      return res.status(409).json({ message: "Only a pending order can be rejected" });
    }
    await connection.query("UPDATE orders SET status = 'rejected', rejection_reason = ? WHERE id = ?", [reason, order.id]);
    await addHistory(connection, order.id, order.status, "rejected", req.auth.id, reason);
    await connection.commit();
    await createNotification({ userId: order.customer_id, orderId: order.id, type: "order_rejected", title: "Order rejected", message: reason, deepLink: `orders/${order.id}` });
    broadcastOrderStatus(order.id, { orderId: Number(order.id), status: "rejected", reason });
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    fail(res, error);
  } finally {
    connection.release();
  }
};

exports.offerDriver = async (req, res) => {
  const orderId = Number(req.params.id);
  const driverId = Number(req.body.driver_id ?? req.body.delivery_guy_id);
  const staleSeconds = Math.max(30, Number(process.env.DRIVER_LOCATION_STALE_SECONDS || 180));
  try {
    const order = await sellerOrder(orderId, req.auth.id);
    if (!order && req.auth.role !== "admin") return res.status(403).json({ message: "Not your order" });
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!["accepted", "searching_driver"].includes(order.status)) return res.status(409).json({ message: "Order is not ready for driver dispatch" });
    const [drivers] = await db.query(
      `SELECT * FROM delivery_guy WHERE id = ? AND approved = 1 AND online = 1 AND status = 'available'
       AND location_updated_at >= DATE_SUB(NOW(), INTERVAL ? SECOND)`,
      [driverId, staleSeconds]
    );
    const driver = drivers[0];
    if (!driver) return res.status(409).json({ message: "Driver is offline, unavailable, unapproved, or has stale GPS" });
    await db.query("UPDATE driver_offers SET status = 'cancelled' WHERE order_id = ? AND status = 'pending'", [orderId]);
    const timeoutSeconds = Math.max(30, Number(process.env.DRIVER_OFFER_TIMEOUT_SECONDS || 90));
    const [result] = await db.query(
      `INSERT INTO driver_offers (order_id, driver_id, offered_by, expires_at)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))`,
      [orderId, driverId, req.auth.id, timeoutSeconds]
    );
    await db.query("UPDATE orders SET status = 'searching_driver' WHERE id = ?", [orderId]);
    await createNotification({
      userId: driver.user_id,
      orderId,
      type: "driver_offer",
      title: "New cooking gas delivery offer",
      message: `Pickup offer for Order #${orderId}. Accept within ${timeoutSeconds} seconds.`,
      deepLink: `driver/offers/${result.insertId}`,
      payload: { offerId: result.insertId, expiresInSeconds: timeoutSeconds },
    });
    broadcastOrderStatus(orderId, { orderId, status: "searching_driver" });
    res.json({
      success: true,
      offerId: result.insertId,
      expiresInSeconds: timeoutSeconds,
      distanceBasis: req.body.distance_basis || null,
    });
  } catch (error) {
    fail(res, error);
  }
};

exports.offerNearestDriver = async (req, res) => {
  const orderId = Number(req.params.id);
  const staleSeconds = Math.max(30, Number(process.env.DRIVER_LOCATION_STALE_SECONDS || 180));
  try {
    const [orders] = await db.query(
      `SELECT o.*, s.latitude AS pickup_lat, s.longitude AS pickup_lng
       FROM orders o INNER JOIN suppliers s ON s.user_id = o.supplier_id
       WHERE o.id = ? AND o.supplier_id = ?`,
      [orderId, req.auth.id]
    );
    const order = orders[0];
    if (!order) return res.status(403).json({ message: "Not your order" });
    const [drivers] = await db.query(
      `SELECT * FROM delivery_guy WHERE approved = 1 AND online = 1 AND status = 'available'
       AND latitude IS NOT NULL AND longitude IS NOT NULL
       AND location_updated_at >= DATE_SUB(NOW(), INTERVAL ? SECOND)`,
      [staleSeconds]
    );
    if (!drivers.length) return res.status(404).json({ message: "No eligible nearby drivers with fresh GPS" });
    const pickup = validateCoordinates(order.pickup_lat, order.pickup_lng);
    const ranked = await Promise.all(drivers.slice(0, 20).map(async (driver) => {
      try {
        const route = await getRoadRoute(pickup, validateCoordinates(driver.latitude, driver.longitude), "reject");
        return { driver, score: route.durationSeconds ?? route.distanceMeters, basis: route.provider };
      } catch {
        return {
          driver,
          score: haversineKm(pickup.lat, pickup.lng, driver.latitude, driver.longitude) * 1000,
          basis: "straight_line_candidate_sort",
        };
      }
    }));
    ranked.sort((a, b) => a.score - b.score);
    req.body.driver_id = ranked[0].driver.id;
    req.body.distance_basis = ranked[0].basis;
    return exports.offerDriver(req, res);
  } catch (error) {
    fail(res, error);
  }
};

exports.respondToOffer = async (req, res) => {
  const accept = req.body.accept === true;
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT dof.*, dg.user_id, o.customer_id, o.supplier_id, o.status AS order_status
       FROM driver_offers dof
       INNER JOIN delivery_guy dg ON dg.id = dof.driver_id
       INNER JOIN orders o ON o.id = dof.order_id
       WHERE dof.id = ? FOR UPDATE`,
      [req.params.offerId]
    );
    const offer = rows[0];
    if (!offer || Number(offer.user_id) !== req.auth.id) {
      await connection.rollback();
      return res.status(403).json({ message: "This offer is not for you" });
    }
    if (offer.status !== "pending" || new Date(offer.expires_at).getTime() <= Date.now()) {
      if (offer.status === "pending") await connection.query("UPDATE driver_offers SET status = 'expired' WHERE id = ?", [offer.id]);
      await connection.commit();
      return res.status(409).json({ message: "This offer has expired or was already answered" });
    }
    if (!accept) {
      await connection.query("UPDATE driver_offers SET status = 'declined', responded_at = NOW() WHERE id = ?", [offer.id]);
      await connection.commit();
      await createNotification({ userId: offer.supplier_id, orderId: offer.order_id, type: "driver_offer_declined", title: "Driver declined offer", message: `Find another driver for Order #${offer.order_id}.`, deepLink: `orders/${offer.order_id}` });
      return res.json({ success: true, status: "declined" });
    }
    const [busy] = await connection.query(
      `SELECT COUNT(*) AS count FROM orders WHERE driver_id = ?
       AND status IN ('driver_assigned','picked_up','in_transit','arrived')`,
      [offer.driver_id]
    );
    if (Number(busy[0].count) > 0) {
      await connection.rollback();
      return res.status(409).json({ message: "Driver already has an active delivery" });
    }
    const [driverUpdate] = await connection.query(
      "UPDATE delivery_guy SET status = 'busy' WHERE id = ? AND status = 'available' AND online = 1",
      [offer.driver_id]
    );
    if (!driverUpdate.affectedRows) {
      await connection.rollback();
      return res.status(409).json({ message: "Driver is no longer available" });
    }
    const [orderUpdate] = await connection.query(
      `UPDATE orders SET driver_id = ?, status = 'driver_assigned', assigned_at = NOW()
       WHERE id = ? AND status = 'searching_driver' AND driver_id IS NULL`,
      [offer.driver_id, offer.order_id]
    );
    if (!orderUpdate.affectedRows) {
      await connection.rollback();
      return res.status(409).json({ message: "Order was assigned elsewhere" });
    }
    await connection.query("UPDATE driver_offers SET status = 'accepted', responded_at = NOW() WHERE id = ?", [offer.id]);
    await connection.query("UPDATE driver_offers SET status = 'cancelled' WHERE order_id = ? AND id <> ? AND status = 'pending'", [offer.order_id, offer.id]);
    await addHistory(connection, offer.order_id, offer.order_status, "driver_assigned", req.auth.id);
    await connection.commit();
    const payload = { orderId: Number(offer.order_id), status: "driver_assigned", delivery_guy_id: offer.driver_id, delivery_user_id: req.auth.id };
    broadcastOrderStatus(offer.order_id, payload);
    await Promise.all([
      createNotification({ userId: offer.customer_id, orderId: offer.order_id, type: "driver_assigned", title: "Driver assigned", message: "A delivery driver accepted your cooking gas order.", deepLink: `orders/${offer.order_id}` }),
      createNotification({ userId: offer.supplier_id, orderId: offer.order_id, type: "driver_assigned", title: "Driver accepted", message: `Driver accepted Order #${offer.order_id}.`, deepLink: `orders/${offer.order_id}` }),
    ]);
    res.json({ success: true, status: "driver_assigned" });
  } catch (error) {
    await connection.rollback();
    fail(res, error);
  } finally {
    connection.release();
  }
};

exports.updateDeliveryState = async (req, res) => {
  const requested = String(req.body.status || "");
  const allowedNext = {
    driver_assigned: "picked_up",
    picked_up: "in_transit",
    in_transit: "arrived",
  };
  try {
    const [rows] = await db.query(
      `SELECT o.*, dg.user_id AS driver_user_id FROM orders o
       INNER JOIN delivery_guy dg ON dg.id = o.driver_id WHERE o.id = ?`,
      [req.params.id]
    );
    const order = rows[0];
    if (!order || Number(order.driver_user_id) !== req.auth.id) return res.status(403).json({ message: "Not assigned to this delivery" });
    if (allowedNext[order.status] !== requested) return res.status(409).json({ message: `Cannot change ${order.status} to ${requested}` });
    const timestampColumn = requested === "picked_up" ? "picked_up_at" : requested === "arrived" ? "arrived_at" : null;
    const sql = timestampColumn
      ? `UPDATE orders SET status = ?, ${timestampColumn} = NOW() WHERE id = ? AND status = ?`
      : "UPDATE orders SET status = ? WHERE id = ? AND status = ?";
    const [result] = await db.query(sql, [requested, order.id, order.status]);
    if (!result.affectedRows) return res.status(409).json({ message: "Order changed; refresh and retry" });
    await db.query("INSERT INTO order_status_history (order_id, from_status, to_status, actor_user_id) VALUES (?, ?, ?, ?)", [order.id, order.status, requested, req.auth.id]);
    broadcastOrderStatus(order.id, { orderId: Number(order.id), status: requested });
    if (requested === "arrived") {
      await createNotification({ userId: order.customer_id, orderId: order.id, type: "driver_arrived", title: "Driver arrived", message: "Your cooking gas delivery has arrived. Give the verification code to the driver only after handover.", deepLink: `orders/${order.id}` });
    }
    res.json({ success: true, status: requested });
  } catch (error) {
    fail(res, error);
  }
};

exports.getDeliveryCode = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM orders WHERE id = ?", [req.params.id]);
    const order = rows[0];
    const allowed = order && (req.auth.role === "admin" || Number(order.customer_id) === req.auth.id || Number(order.supplier_id) === req.auth.id);
    if (!allowed) return res.status(403).json({ message: "Only this order's customer or seller can view a delivery code" });
    if (!["driver_assigned", "picked_up", "in_transit", "arrived"].includes(order.status)) return res.status(409).json({ message: "A driver must be assigned before creating the delivery code" });
    const result = await issueCode(order.id);
    await db.query("INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id) VALUES (?, 'delivery_code_issued', 'order', ?)", [req.auth.id, String(order.id)]);
    res.json({ success: true, code: result.code, expiresInMinutes: result.expiresInMinutes });
  } catch (error) {
    fail(res, error);
  }
};

exports.verifyDeliveryCode = async (req, res) => {
  const orderId = Number(req.params.id);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT o.*, dg.user_id AS driver_user_id FROM orders o
       INNER JOIN delivery_guy dg ON dg.id = o.driver_id WHERE o.id = ? FOR UPDATE`,
      [orderId]
    );
    const order = rows[0];
    if (!order || Number(order.driver_user_id) !== req.auth.id) {
      await connection.rollback();
      return res.status(403).json({ message: "Not assigned to this delivery" });
    }
    if (order.status !== "arrived") {
      await connection.rollback();
      return res.status(409).json({ message: "Mark the delivery arrived before verification" });
    }
    const checked = await verifyCode(orderId, req.body.code, connection);
    if (!checked.ok) {
      await connection.rollback();
      return res.status(400).json({ valid: false, reason: checked.reason, remainingAttempts: checked.remainingAttempts });
    }
    const [updated] = await connection.query(
      "UPDATE orders SET status = 'delivered', delivered_at = NOW() WHERE id = ? AND status = 'arrived'",
      [orderId]
    );
    if (!updated.affectedRows) {
      await connection.rollback();
      return res.status(409).json({ message: "Delivery was already completed" });
    }
    await connection.query("UPDATE delivery_guy SET status = 'available' WHERE id = ?", [order.driver_id]);
    await addHistory(connection, orderId, "arrived", "delivered", req.auth.id);
    await connection.commit();
    broadcastOrderStatus(orderId, { orderId, status: "delivered" });
    emitToOrder(orderId, "deliveryConfirmed", { orderId });
    await Promise.all([
      createNotification({ userId: order.customer_id, orderId, type: "delivered", title: "Delivery complete", message: "Your cooking gas delivery was securely verified and completed.", deepLink: `orders/${orderId}` }),
      createNotification({ userId: order.supplier_id, orderId, type: "delivered", title: "Delivery complete", message: `Order #${orderId} was delivered.`, deepLink: `orders/${orderId}` }),
    ]);
    res.json({ valid: true, status: "delivered" });
  } catch (error) {
    await connection.rollback();
    fail(res, error);
  } finally {
    connection.release();
  }
};

exports.getPricingRule = async (req, res) => {
  const [rows] = await db.query("SELECT * FROM pricing_rules WHERE active = 1 ORDER BY id DESC LIMIT 1");
  res.json({ rule: rows[0] || null });
};

exports.updatePricingRule = async (req, res) => {
  const fields = ["base_fee", "rate_per_km", "minimum_fee", "maximum_distance_km", "zone_surcharge", "time_surcharge"];
  const values = {};
  for (const field of fields) {
    const number = Number(req.body[field]);
    if (!Number.isFinite(number) || number < 0) return res.status(400).json({ message: `${field} must be a positive number` });
    values[field] = number;
  }
  const fallback = req.body.fallback_policy === "straight_line" ? "straight_line" : "reject";
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("UPDATE pricing_rules SET active = 0 WHERE active = 1");
    const version = `v${Date.now()}`;
    await connection.query(
      `INSERT INTO pricing_rules
       (version, base_fee, rate_per_km, minimum_fee, maximum_distance_km, zone_surcharge,
        time_surcharge, fallback_policy, active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [version, values.base_fee, values.rate_per_km, values.minimum_fee, values.maximum_distance_km,
        values.zone_surcharge, values.time_surcharge, fallback, req.auth.id]
    );
    await connection.query("INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id) VALUES (?, 'pricing_rule_changed', 'pricing_rule', ?)", [req.auth.id, version]);
    await connection.commit();
    res.json({ success: true, version });
  } catch (error) {
    await connection.rollback();
    fail(res, error);
  } finally {
    connection.release();
  }
};
