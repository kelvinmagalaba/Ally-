const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { safeUser } = require("../utils/safeUser");
const { buildPublicUser, upsertDeliveryGuy } = require("../utils/authProfile");
const { haversineKm } = require("../utils/geo");
const authController = require("../controllers/authController");
const { requireAuth, requireRole, requireSelfParam } = require("../middleware/auth");
const discoveryController = require("../controllers/discoveryController");
const { createRateLimiter } = require("../middleware/rateLimit");

const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 12,
  key: (req) => `${req.ip}:${String(req.body?.email || req.body?.phone || "").toLowerCase()}`,
});

function parseJsonField(val, fallback) {
  if (val == null || val === "") return fallback;
  if (typeof val === "object") return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

router.post("/register", authController.register);

router.post("/login", loginLimiter, authController.login);

router.post("/verify-login-otp", authController.verifyLoginOTP);
router.put("/settings", requireAuth, authController.updateSettings);
// These secure discovery routes are intentionally registered before the
// legacy handlers below so existing URLs keep working with corrected data.
router.get("/suppliers", requireAuth, discoveryController.listApprovedSellers);
router.get("/drivers-nearby", requireAuth, requireRole("supplier", "admin"), discoveryController.listNearbyDrivers);
router.get("/catalog/:supplierId", requireAuth, discoveryController.getCatalog);

router.get("/user/:id", requireAuth, requireSelfParam("id"), (req, res) => {
  const userId = req.params.id;
  db.query("SELECT role FROM users WHERE id = ?", [userId], (err, roleRows) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!roleRows[0]) return res.status(404).json({ message: "Not found" });
    buildPublicUser(userId, roleRows[0].role, (e2, full) => {
      if (e2 || !full) return res.status(500).json({ message: e2 ? e2.message : "Failed" });
      res.json(safeUser(full));
    });
  });
});

router.put("/user/:id", requireAuth, requireSelfParam("id"), (req, res) => {
  const userId = req.params.id;
  const body = req.body;

  db.query("SELECT role FROM users WHERE id = ?", [userId], (roleErr, roleRows) => {
    if (roleErr) return res.status(500).json({ message: roleErr.message });
    if (!roleRows[0]) return res.status(404).json({ message: "Not found" });
    const role = roleRows[0].role;

    const respond = () => {
      buildPublicUser(userId, role, (e2, full) => {
        if (e2 || !full) return res.json({ success: true });
        res.json({ success: true, user: safeUser(full) });
      });
    };

    const tasks = [];

    if (role === "customer") {
      const cMap = {
        fullName: "full_name",
        full_name: "full_name",
        country: "country",
        city: "city",
        area: "area",
        gps: "gps",
        profile_image: "profile_image",
        latitude: "latitude",
        longitude: "longitude",
      };
      const fields = [];
      const values = [];
      Object.keys(cMap).forEach((k) => {
        if (body[k] !== undefined) {
          fields.push(`${cMap[k]} = ?`);
          values.push(body[k]);
        }
      });
      if (body.paymentMethods !== undefined) {
        fields.push("payment_methods = ?");
        values.push(JSON.stringify(body.paymentMethods));
      }
      if (fields.length) {
        tasks.push((next) => {
          values.push(userId);
          db.query(`UPDATE customers SET ${fields.join(", ")} WHERE user_id = ?`, values, next);
        });
      }
    }

    if (role === "supplier") {
      const sMap = {
        fullName: "full_name",
        full_name: "full_name",
        country: "country",
        city: "city",
        area: "area",
        gps: "gps",
        profile_image: "profile_image",
        latitude: "latitude",
        longitude: "longitude",
      };
      const fields = [];
      const values = [];
      Object.keys(sMap).forEach((k) => {
        if (body[k] !== undefined) {
          fields.push(`${sMap[k]} = ?`);
          values.push(body[k]);
        }
      });
      if (body.paymentMethods !== undefined) {
        fields.push("payment_methods = ?");
        values.push(JSON.stringify(body.paymentMethods));
      }
      if (body.selectedBrands !== undefined) {
        fields.push("selected_brands = ?");
        values.push(JSON.stringify(body.selectedBrands));
      }
            if (fields.length) {
        tasks.push((next) => {
          values.push(userId);
          db.query(`UPDATE suppliers SET ${fields.join(", ")} WHERE user_id = ?`, values, next);
        });
      }
    }

    if (role === "driver" || role === "delivery_guy") {
      const hasDg =
        body.fullName !== undefined ||
        body.full_name !== undefined ||
        body.phone !== undefined ||
        body.city !== undefined ||
        body.area !== undefined ||
        body.plateNumber !== undefined ||
        body.plate_number !== undefined ||
        body.drivingLicense !== undefined ||
        body.driving_license !== undefined ||
        body.vehicle_type !== undefined ||
        body.latitude !== undefined ||
        body.longitude !== undefined;

      if (hasDg) {
        tasks.push((next) => {
          db.query("SELECT * FROM delivery_guy WHERE user_id = ?", [userId], (e, dr) => {
            if (e) return next(e);
            const cur = (dr && dr[0]) || {};
            const full_name =
              body.fullName !== undefined
                ? body.fullName
                : body.full_name !== undefined
                  ? body.full_name
                  : cur.full_name || "";
            const dgPhone = body.phone !== undefined ? body.phone : cur.phone || "";
            const city = body.city !== undefined ? body.city : cur.city || "";
            const area = body.area !== undefined ? body.area : cur.area || "";
            const plate_number =
              body.plateNumber !== undefined
                ? body.plateNumber
                : body.plate_number !== undefined
                  ? body.plate_number
                  : cur.plate_number || "";
            const vehicle_type =
              body.drivingLicense !== undefined
                ? body.drivingLicense
                : body.driving_license !== undefined
                  ? body.driving_license
                  : body.vehicle_type !== undefined
                    ? body.vehicle_type
                    : cur.vehicle_type || "";
            const latitude = body.latitude !== undefined ? body.latitude : cur.latitude;
            const longitude = body.longitude !== undefined ? body.longitude : cur.longitude;
            const status = cur.status || "offline";

            upsertDeliveryGuy(
              userId,
              {
                full_name,
                phone: dgPhone,
                city,
                area,
                vehicle_type,
                plate_number,
                latitude,
                longitude,
                status,
              },
              next
            );
          });
        });
      }
    }

    function run(i) {
      if (i >= tasks.length) return respond();
      tasks[i]((e) => {
        if (e) return res.status(500).json({ message: e.message });
        run(i + 1);
      });
    }
    run(0);
  });
});

router.get("/suppliers", (req, res) => {
  const city = (req.query.city || "").trim();
  const refLat = req.query.latitude != null && req.query.latitude !== "" ? Number(req.query.latitude) : null;
  const refLng = req.query.longitude != null && req.query.longitude !== "" ? Number(req.query.longitude) : null;
  const maxKmRaw = req.query.maxKm != null && req.query.maxKm !== "" ? Number(req.query.maxKm) : NaN;
  const maxKm = Number.isFinite(maxKmRaw) ? Math.min(Math.max(maxKmRaw, 0.5), 20000) : 50;

  let sql = `
    SELECT u.id, u.email, u.phone,
           sp.full_name, sp.city, sp.area, sp.country, sp.latitude, sp.longitude,
           sp.selected_brands, sp.payment_methods
    FROM users u
    INNER JOIN suppliers sp ON sp.user_id = u.id
    WHERE u.role = 'supplier'`;
  const params = [];
  if (city) {
    sql += " AND (sp.city LIKE ? OR sp.area LIKE ?)";
    params.push(`%${city}%`, `%${city}%`);
  }
  db.query(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    let parsed = rows.map((r) => ({
      id: r.id,
      full_name: r.full_name,
      email: r.email,
      phone: r.phone,
      city: r.city,
      area: r.area,
      country: r.country,
      latitude: r.latitude,
      longitude: r.longitude,
      selected_brands: parseJsonField(r.selected_brands, []),
      payment_methods: parseJsonField(r.payment_methods, []),
    }));

    if (refLat != null && refLng != null && Number.isFinite(refLat) && Number.isFinite(refLng)) {
      parsed = parsed
        .map((r) => {
          if (r.latitude == null || r.longitude == null) {
            return { ...r, distance_km: null };
          }
          const d = haversineKm(refLat, refLng, Number(r.latitude), Number(r.longitude));
          return { ...r, distance_km: d };
        })
        .filter((r) => r.distance_km == null || r.distance_km <= maxKm)
        .sort((a, b) => {
          if (a.distance_km == null) return 1;
          if (b.distance_km == null) return -1;
          return a.distance_km - b.distance_km;
        });
    }

    res.json(parsed);
  });
});

router.get("/drivers-nearby", (req, res) => {
  const refLat = req.query.latitude != null ? Number(req.query.latitude) : null;
  const refLng = req.query.longitude != null ? Number(req.query.longitude) : null;
  const maxKmRaw = req.query.maxKm != null ? Number(req.query.maxKm) : 30;
  const maxKm = Number.isFinite(maxKmRaw) ? Math.min(Math.max(maxKmRaw, 0.5), 500) : 30;

  db.query(
    `SELECT dg.id,
            dg.user_id,
            COALESCE(NULLIF(TRIM(dg.full_name), ''), u.email) AS full_name,
            COALESCE(NULLIF(TRIM(dg.phone), ''), u.phone) AS phone,
            dg.latitude, dg.longitude, dg.status
     FROM users u
     INNER JOIN delivery_guy dg ON dg.user_id = u.id
     WHERE u.role IN ('delivery_guy', 'driver')
       AND dg.status = 'available'
       AND dg.latitude IS NOT NULL AND dg.longitude IS NOT NULL
     LIMIT 200`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ message: err.message });
      const mapped = rows.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        full_name: r.full_name,
        phone: r.phone,
        latitude: r.latitude,
        longitude: r.longitude,
      }));
      if (refLat == null || refLng == null || !Number.isFinite(refLat) || !Number.isFinite(refLng)) {
        return res.json(mapped.map((r) => ({ ...r, distance_km: null })));
      }
      const list = mapped
        .map((r) => ({
          ...r,
          distance_km: haversineKm(refLat, refLng, Number(r.latitude), Number(r.longitude)),
        }))
        .filter((r) => r.distance_km <= maxKm)
        .sort((a, b) => a.distance_km - b.distance_km);
      res.json(list);
    }
  );
});

router.get("/catalog/:supplierId", (req, res) => {
  const id = req.params.supplierId;
  db.query(
    `SELECT u.id, sp.full_name, sp.city, sp.selected_brands
     FROM users u
     INNER JOIN suppliers sp ON sp.user_id = u.id
     WHERE u.id = ? AND u.role = 'supplier'`,
    [id],
    (err, rows) => {
      if (err) return res.status(500).json({ message: err.message });
      if (!rows[0]) return res.status(404).json({ message: "Supplier not found" });
      const r = rows[0];
      res.json({
        supplierId: r.id,
        name: r.full_name,
        city: r.city,
        selected_brands: parseJsonField(r.selected_brands, []),
      });
    }
  );
});

module.exports = router;
