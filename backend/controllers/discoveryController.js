const db = require("../config/db");
const { getRoadRoute } = require("../services/routingService");
const { haversineKm } = require("../utils/geo");
const { isValidLatitude, isValidLongitude } = require("../utils/coordinates");

function parseJson(value, fallback = []) {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

async function distanceFor(origin, point) {
  try {
    const route = await getRoadRoute(origin, point, "reject");
    return {
      distance_km: route.distanceMeters / 1000,
      eta_seconds: route.durationSeconds,
      distance_basis: route.provider,
      is_road_distance: true,
    };
  } catch {
    return {
      distance_km: haversineKm(origin.lat, origin.lng, point.lat, point.lng),
      eta_seconds: null,
      distance_basis: "straight_line_sort_only",
      is_road_distance: false,
    };
  }
}

exports.listApprovedSellers = async (req, res) => {
  try {
    const q = String(req.query.q || req.query.search || "").trim();
    const city = String(req.query.city || "").trim();
    const lat = req.query.latitude === undefined ? null : Number(req.query.latitude);
    const lng = req.query.longitude === undefined ? null : Number(req.query.longitude);
    const hasOrigin = lat != null && lng != null && isValidLatitude(lat) && isValidLongitude(lng);
    if ((req.query.latitude !== undefined || req.query.longitude !== undefined) && !hasOrigin) {
      return res.status(400).json({ message: "Invalid search coordinates" });
    }
    const params = [];
    let filters = "WHERE u.role = 'supplier' AND sp.active = 1 AND sp.approved = 1 AND sp.verified = 1";
    if (city) {
      filters += " AND (sp.city LIKE ? OR sp.area LIKE ?)";
      params.push(`%${city}%`, `%${city}%`);
    }
    if (q) {
      filters += ` AND (sp.full_name LIKE ? OR sp.city LIKE ? OR sp.area LIKE ? OR sp.landmark LIKE ?
        OR EXISTS (SELECT 1 FROM gas_prices gp WHERE gp.supplier_id = sp.user_id AND gp.available = 1
          AND (gp.brand LIKE ? OR gp.size LIKE ?)))`;
      params.push(...Array(6).fill(`%${q}%`));
    }
    const [rows] = await db.query(
      `SELECT u.id, sp.full_name, sp.city, sp.area, sp.country, sp.landmark,
        sp.latitude, sp.longitude, sp.selected_brands, sp.open_status, sp.verified,
        sp.service_radius_km, sp.location_source, sp.location_accuracy_meters, sp.location_updated_at,
        (SELECT COUNT(*) FROM gas_prices gp WHERE gp.supplier_id = sp.user_id AND gp.available = 1) AS available_products
       FROM users u INNER JOIN suppliers sp ON sp.user_id = u.id
       ${filters} ORDER BY sp.full_name LIMIT 100`,
      params
    );
    const enriched = [];
    for (const row of rows) {
      const validLocation = isValidLatitude(row.latitude) && isValidLongitude(row.longitude);
      let distance = { distance_km: null, eta_seconds: null, distance_basis: null, is_road_distance: false };
      if (hasOrigin && validLocation) distance = await distanceFor({ lat, lng }, { lat: Number(row.latitude), lng: Number(row.longitude) });
      enriched.push({
        id: Number(row.id),
        full_name: row.full_name,
        city: row.city,
        area: row.area,
        country: row.country,
        landmark: row.landmark,
        latitude: validLocation ? Number(row.latitude) : null,
        longitude: validLocation ? Number(row.longitude) : null,
        location_status: validLocation ? (row.location_updated_at ? "saved" : "approximate") : "missing",
        location_source: row.location_source,
        location_accuracy_meters: row.location_accuracy_meters == null ? null : Number(row.location_accuracy_meters),
        selected_brands: parseJson(row.selected_brands),
        open_status: row.open_status,
        verified: Boolean(row.verified),
        available_products: Number(row.available_products),
        ...distance,
      });
    }
    if (hasOrigin) enriched.sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
    const maxKm = Number(req.query.maxKm || 0);
    res.json(maxKm > 0 ? enriched.filter((seller) => seller.distance_km == null || seller.distance_km <= maxKm) : enriched);
  } catch (error) {
    console.error("Seller discovery:", error);
    res.status(500).json({ message: "Could not search sellers" });
  }
};

exports.getCatalog = async (req, res) => {
  try {
    const [sellerRows] = await db.query(
      `SELECT sp.user_id, sp.full_name, sp.city, sp.selected_brands
       FROM suppliers sp WHERE sp.user_id = ? AND sp.active = 1 AND sp.approved = 1 AND sp.verified = 1`,
      [req.params.supplierId]
    );
    if (!sellerRows[0]) return res.status(404).json({ message: "Seller not found" });
    const [products] = await db.query(
      `SELECT brand, size, price, stock_quantity, available, product_type
       FROM gas_prices WHERE supplier_id = ? AND available = 1 ORDER BY brand, size`,
      [req.params.supplierId]
    );
    const prices = {};
    for (const product of products) {
      prices[product.brand] ||= {};
      prices[product.brand][product.size] = Number(product.price);
    }
    res.json({
      supplierId: Number(sellerRows[0].user_id),
      name: sellerRows[0].full_name,
      city: sellerRows[0].city,
      selected_brands: parseJson(sellerRows[0].selected_brands),
      prices,
      products: products.map((p) => ({ ...p, price: Number(p.price), stock_quantity: Number(p.stock_quantity) })),
    });
  } catch (error) {
    res.status(500).json({ message: "Could not load seller catalog" });
  }
};

exports.listNearbyDrivers = async (req, res) => {
  try {
    const lat = Number(req.query.latitude);
    const lng = Number(req.query.longitude);
    if (!isValidLatitude(lat) || !isValidLongitude(lng)) return res.status(400).json({ message: "Valid pickup coordinates are required" });
    const staleSeconds = Math.max(30, Number(process.env.DRIVER_LOCATION_STALE_SECONDS || 180));
    const [rows] = await db.query(
      `SELECT dg.id, dg.user_id, dg.full_name, dg.phone, dg.vehicle_type, dg.plate_number,
        dg.latitude, dg.longitude, dg.location_updated_at
       FROM delivery_guy dg INNER JOIN users u ON u.id = dg.user_id
       WHERE u.role IN ('driver','delivery_guy') AND dg.approved = 1 AND dg.online = 1
         AND dg.status = 'available' AND dg.latitude IS NOT NULL AND dg.longitude IS NOT NULL
         AND dg.location_updated_at >= DATE_SUB(NOW(), INTERVAL ? SECOND) LIMIT 100`,
      [staleSeconds]
    );
    const list = [];
    for (const row of rows) {
      const distance = await distanceFor({ lat, lng }, { lat: Number(row.latitude), lng: Number(row.longitude) });
      list.push({ ...row, latitude: Number(row.latitude), longitude: Number(row.longitude), ...distance });
    }
    list.sort((a, b) => (a.eta_seconds ?? a.distance_km) - (b.eta_seconds ?? b.distance_km));
    res.json(list);
  } catch (error) {
    console.error("Driver discovery:", error);
    res.status(500).json({ message: "Could not search drivers" });
  }
};
