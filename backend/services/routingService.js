const crypto = require("crypto");
const db = require("../config/db");
const { haversineKm } = require("../utils/geo");
const { validateCoordinates } = require("../utils/coordinates");

function routeCacheKey(origin, destination, provider) {
  const normalized = [origin.lat, origin.lng, destination.lat, destination.lng]
    .map((n) => Number(n).toFixed(5))
    .join(":");
  return crypto.createHash("sha256").update(`${provider}:${normalized}`).digest("hex");
}

function parseDurationSeconds(value) {
  const match = String(value || "").match(/^([0-9.]+)s$/);
  return match ? Math.round(Number(match[1])) : null;
}

async function googleRoute(origin, destination) {
  const key = process.env.GOOGLE_ROUTES_API_KEY || process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!key) throw Object.assign(new Error("Google Routes is not configured"), { code: "ROUTING_NOT_CONFIGURED" });
  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      computeAlternativeRoutes: false,
      languageCode: "en",
      units: "METRIC",
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw Object.assign(new Error(`Google Routes request failed (${response.status})`), {
      code: "ROUTING_PROVIDER_ERROR",
      detail: body.slice(0, 300),
    });
  }
  const data = await response.json();
  const route = data.routes?.[0];
  if (!route?.distanceMeters) throw Object.assign(new Error("No driveable route found"), { code: "NO_ROUTE" });
  return {
    distanceMeters: Number(route.distanceMeters),
    durationSeconds: parseDurationSeconds(route.duration),
    encodedPolyline: route.polyline?.encodedPolyline || null,
    provider: "google_routes",
    isRoadDistance: true,
  };
}

async function osrmRoute(origin, destination) {
  const base = String(process.env.OSRM_BASE_URL || "").replace(/\/$/, "");
  if (!base) throw Object.assign(new Error("OSRM is not configured"), { code: "ROUTING_NOT_CONFIGURED" });
  const url = `${base}/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=false&steps=false`;
  const response = await fetch(url, { headers: { "User-Agent": "CGD-Cooking-Gas-Delivery/1.0" } });
  if (!response.ok) throw Object.assign(new Error(`OSRM request failed (${response.status})`), { code: "ROUTING_PROVIDER_ERROR" });
  const data = await response.json();
  const route = data.routes?.[0];
  if (!route?.distance) throw Object.assign(new Error("No driveable route found"), { code: "NO_ROUTE" });
  return {
    distanceMeters: Math.round(Number(route.distance)),
    durationSeconds: Math.round(Number(route.duration || 0)) || null,
    encodedPolyline: null,
    provider: "osrm",
    isRoadDistance: true,
  };
}

async function readCache(key) {
  const [rows] = await db.query(
    `SELECT distance_meters, duration_seconds, provider
     FROM route_quote_cache WHERE cache_key = ? AND expires_at > NOW()`,
    [key]
  );
  if (!rows[0]) return null;
  return {
    distanceMeters: Number(rows[0].distance_meters),
    durationSeconds: rows[0].duration_seconds == null ? null : Number(rows[0].duration_seconds),
    encodedPolyline: null,
    provider: String(rows[0].provider),
    isRoadDistance: !String(rows[0].provider).includes("straight_line"),
    cached: true,
  };
}

async function writeCache(key, origin, destination, route) {
  const ttlSeconds = Math.max(60, Number(process.env.ROUTE_CACHE_TTL_SECONDS || 900));
  await db.query(
    `INSERT INTO route_quote_cache
      (cache_key, origin_lat, origin_lng, destination_lat, destination_lng,
       distance_meters, duration_seconds, provider, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))
     ON DUPLICATE KEY UPDATE distance_meters = VALUES(distance_meters),
       duration_seconds = VALUES(duration_seconds), provider = VALUES(provider),
       expires_at = VALUES(expires_at)`,
    [key, origin.lat, origin.lng, destination.lat, destination.lng, route.distanceMeters, route.durationSeconds, route.provider, ttlSeconds]
  );
}

async function getRoadRoute(originInput, destinationInput, fallbackPolicy = "reject") {
  const origin = validateCoordinates(originInput.lat, originInput.lng);
  const destination = validateCoordinates(destinationInput.lat, destinationInput.lng);
  const configured = String(process.env.ROUTING_PROVIDER || "google").toLowerCase();
  const provider = configured === "osrm" ? "osrm" : "google";
  const key = routeCacheKey(origin, destination, provider);
  const cached = await readCache(key);
  if (cached) return cached;
  try {
    const route = provider === "osrm" ? await osrmRoute(origin, destination) : await googleRoute(origin, destination);
    await writeCache(key, origin, destination, route);
    return route;
  } catch (error) {
    if (fallbackPolicy !== "straight_line") throw error;
    const distanceMeters = Math.round(haversineKm(origin.lat, origin.lng, destination.lat, destination.lng) * 1000);
    const fallback = {
      distanceMeters,
      durationSeconds: null,
      encodedPolyline: null,
      provider: "straight_line_estimate",
      isRoadDistance: false,
      warning: "Routing was unavailable; this quote uses a clearly labelled straight-line fallback policy.",
    };
    await writeCache(routeCacheKey(origin, destination, fallback.provider), origin, destination, fallback);
    return fallback;
  }
}

module.exports = { getRoadRoute, routeCacheKey, parseDurationSeconds };
