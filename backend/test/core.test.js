process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { validateCoordinates, isValidLatitude, isValidLongitude } = require("../utils/coordinates");
const { normalizeTanzaniaPhone, isValidTanzaniaPhone } = require("../utils/phone");
const { issueAuthToken, verifyAuthToken } = require("../utils/authToken");
const { calculateDeliveryFee } = require("../services/pricingService");
const { generateCode, hashCode } = require("../services/deliveryVerificationService");
const { routeCacheKey, parseDurationSeconds } = require("../services/routingService");

test("coordinates accept valid Tanzania coordinates and reject invalid ranges", () => {
  assert.deepEqual(validateCoordinates(-6.7924, 39.2083), { lat: -6.7924, lng: 39.2083 });
  assert.equal(isValidLatitude(-91), false);
  assert.equal(isValidLongitude(181), false);
  assert.throws(() => validateCoordinates("unknown", 39), /Latitude must be between/);
});

test("Tanzania mobile numbers normalize without assuming a carrier", () => {
  assert.equal(normalizeTanzaniaPhone("0673 565 685"), "+255673565685");
  assert.equal(normalizeTanzaniaPhone("+255 712 345 678"), "+255712345678");
  assert.equal(isValidTanzaniaPhone("0788 111 222"), true);
  assert.equal(isValidTanzaniaPhone("+254700000000"), false);
});

test("auth tokens reject tampering and expiry", () => {
  const token = issueAuthToken({ id: 17, role: "customer" }, 60);
  assert.deepEqual(
    { id: verifyAuthToken(token).id, role: verifyAuthToken(token).role },
    { id: 17, role: "customer" }
  );
  assert.throws(() => verifyAuthToken(`${token.slice(0, -1)}x`), /Invalid authentication token/);
  assert.throws(() => verifyAuthToken(issueAuthToken({ id: 17, role: "customer" }, -1)), /expired/);
});

test("delivery fee obeys configured base, kilometre rate, surcharges, and minimum", () => {
  const rule = { base_fee: 1000, rate_per_km: 500, minimum_fee: 2500, zone_surcharge: 200, time_surcharge: 300 };
  assert.equal(calculateDeliveryFee(rule, 1), 2500);
  assert.equal(calculateDeliveryFee(rule, 10), 6500);
});

test("delivery verification codes are random-looking, six digit, and hashed", () => {
  const codes = new Set(Array.from({ length: 20 }, generateCode));
  assert.ok(codes.size > 1);
  for (const code of codes) assert.match(code, /^\d{6}$/);
  const code = generateCode();
  assert.notEqual(hashCode(code), code);
  assert.notEqual(hashCode(code), hashCode(`${code}0`));
});

test("route parsing and cache keys are deterministic and provider-specific", () => {
  assert.equal(parseDurationSeconds("123.5s"), 124);
  const origin = { lat: -6.8, lng: 39.2 };
  const destination = { lat: -6.7, lng: 39.3 };
  assert.equal(routeCacheKey(origin, destination, "google"), routeCacheKey(origin, destination, "google"));
  assert.notEqual(routeCacheKey(origin, destination, "google"), routeCacheKey(origin, destination, "osrm"));
});

test("security contracts keep legacy unsafe order mutations out of active routes", () => {
  const orderRoutes = fs.readFileSync(path.join(__dirname, "..", "routes", "orderRoutes.js"), "utf8");
  const workflowRoutes = fs.readFileSync(path.join(__dirname, "..", "routes", "workflowRoutes.js"), "utf8");
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(orderRoutes, /router\.use\(requireAuth\)/);
  assert.doesNotMatch(orderRoutes, /claim|auto-assign-driver|verify-receipt-code|start-delivery/);
  assert.match(workflowRoutes, /verify-delivery/);
  assert.match(server, /io\.use/);
  assert.match(server, /canAccessOrder/);
  assert.match(server, /driver_location_updated/);
});

test("client runtime contains no placeholder Google Maps key", () => {
  const frontendRoot = path.join(__dirname, "..", "..", "frontend", "src");
  const stack = [frontendRoot];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        assert.doesNotMatch(fs.readFileSync(full, "utf8"), /YOUR_GOOGLE_MAPS_API_KEY/);
      }
    }
  }
});
