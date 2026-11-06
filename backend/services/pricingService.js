const crypto = require("crypto");
const db = require("../config/db");
const { getRoadRoute } = require("./routingService");
const { validateCoordinates } = require("../utils/coordinates");

function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function calculateDeliveryFee(rule, distanceKm) {
  const raw = Number(rule.base_fee) + distanceKm * Number(rule.rate_per_km) +
    Number(rule.zone_surcharge || 0) + Number(rule.time_surcharge || 0);
  return money(Math.max(Number(rule.minimum_fee), raw));
}

async function getActiveRule() {
  const [rows] = await db.query("SELECT * FROM pricing_rules WHERE active = 1 ORDER BY id DESC LIMIT 1");
  if (!rows[0]) throw Object.assign(new Error("No active delivery pricing rule is configured"), { statusCode: 503 });
  return rows[0];
}

async function createOrderQuote({ customerId, supplierId, brand, size, quantity = 1, orderType = "refill", latitude, longitude }) {
  const destination = validateCoordinates(latitude, longitude);
  const qty = Math.max(1, Math.min(20, Number(quantity) || 1));
  const [sellerRows] = await db.query(
    `SELECT user_id, latitude, longitude, active, approved, service_radius_km
     FROM suppliers WHERE user_id = ? LIMIT 1`,
    [supplierId]
  );
  const seller = sellerRows[0];
  if (!seller || !seller.active || !seller.approved) throw Object.assign(new Error("Seller is not available"), { statusCode: 404 });
  const origin = validateCoordinates(seller.latitude, seller.longitude);
  const [productRows] = await db.query(
    `SELECT price, stock_quantity, available FROM gas_prices
     WHERE supplier_id = ? AND brand = ? AND size = ? LIMIT 1`,
    [supplierId, String(brand).trim(), String(size).trim()]
  );
  const product = productRows[0];
  if (!product || !product.available) throw Object.assign(new Error("This cooking gas product is unavailable"), { statusCode: 409 });
  if (Number(product.stock_quantity) < qty) {
    throw Object.assign(new Error("Requested quantity exceeds current stock"), { statusCode: 409 });
  }
  const rule = await getActiveRule();
  const route = await getRoadRoute(origin, destination, rule.fallback_policy);
  const distanceKm = money(route.distanceMeters / 1000);
  if (distanceKm > Number(rule.maximum_distance_km)) {
    throw Object.assign(new Error(`Delivery point is outside the ${Number(rule.maximum_distance_km)} km service limit`), { statusCode: 422 });
  }
  const unitPrice = money(product.price);
  const subtotal = money(unitPrice * qty);
  const deliveryFee = calculateDeliveryFee(rule, distanceKm);
  const discount = 0;
  const total = money(subtotal + deliveryFee - discount);
  const quoteId = crypto.randomUUID();
  const ttlMinutes = Math.max(2, Number(process.env.ORDER_QUOTE_TTL_MINUTES || 15));
  await db.query(
    `INSERT INTO order_quotes
      (id, customer_id, supplier_id, brand, size, quantity, order_type,
       destination_lat, destination_lng, unit_price, subtotal, delivery_fee, discount,
       total_amount, road_distance_km, route_duration_seconds, route_provider,
       pricing_rule_id, pricing_rule_version, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [quoteId, customerId, supplierId, String(brand).trim(), String(size).trim(), qty, String(orderType || "refill"),
      destination.lat, destination.lng, unitPrice, subtotal, deliveryFee, discount, total, distanceKm,
      route.durationSeconds, route.provider, rule.id, rule.version, ttlMinutes]
  );
  return {
    quoteId,
    currency: rule.currency || "TZS",
    unitPrice,
    quantity: qty,
    subtotal,
    deliveryFee,
    discount,
    total,
    distanceKm,
    durationSeconds: route.durationSeconds,
    routeProvider: route.provider,
    isRoadDistance: route.isRoadDistance,
    warning: route.warning || null,
    pricingRuleVersion: rule.version,
    expiresInMinutes: ttlMinutes,
  };
}

module.exports = { money, calculateDeliveryFee, getActiveRule, createOrderQuote };
