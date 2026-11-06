const db = require("../config/db");

const USER_AUTH_COLS = "id, email, phone, password_hash, role, created_at";

/**
 * Login: users table ONLY (no profile joins).
 */
function selectUserForLogin(identifier, callback) {
  const id = identifier != null ? String(identifier).trim() : "";
  if (!id) return callback(new Error("empty identifier"), []);
  db.query(
    `SELECT id, password_hash, role FROM users WHERE email = ? OR phone = ? LIMIT 1`,
    [id, id],
    callback
  );
}

function fetchDeliveryGuyProfile(userId, callback) {
  db.query(
    `SELECT id, full_name, phone, city, area, vehicle_type, plate_number, status, latitude, longitude
     FROM delivery_guy WHERE user_id = ?`,
    [userId],
    (err, rows) => {
      if (err) return callback(err);
      const d = rows && rows[0];
      callback(null, {
        id: d && d.id != null ? Number(d.id) : null,
        full_name: d && d.full_name != null ? String(d.full_name) : "",
        phone: d && d.phone != null ? String(d.phone) : "",
        city: d && d.city != null ? String(d.city) : "",
        area: d && d.area != null ? String(d.area) : "",
        vehicle_type: d && d.vehicle_type != null ? String(d.vehicle_type) : "",
        plate_number: d && d.plate_number != null ? String(d.plate_number) : "",
        status: d && d.status != null ? String(d.status) : "offline",
        latitude: d && d.latitude != null ? d.latitude : null,
        longitude: d && d.longitude != null ? d.longitude : null,
      });
    }
  );
}

function parseJson(val, fallback) {
  if (val == null || val === "") return fallback;
  if (typeof val === "object") return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

/** Flatten to API shape expected by clients */
function shapePublicUser(authRow, profile) {
  const pay = parseJson(profile.payment_methods, null);
  const brands = profile.selected_brands != null ? parseJson(profile.selected_brands, []) : [];

  const fullName =
    profile.full_name != null && String(profile.full_name).trim() !== ""
      ? String(profile.full_name)
      : authRow.email || "User";

  return {
    id: authRow.id,
    full_name: fullName,
    email: authRow.email,
    phone: authRow.phone != null ? String(authRow.phone) : "",
    role: authRow.role,
    country: profile.country != null ? String(profile.country) : "",
    city: profile.city != null ? String(profile.city) : "",
    area: profile.area != null ? String(profile.area) : "",
    gps: profile.gps != null ? String(profile.gps) : "",
    profile_image: profile.profile_image != null ? profile.profile_image : null,
    latitude: profile.latitude != null ? profile.latitude : null,
    longitude: profile.longitude != null ? profile.longitude : null,
    payment_methods: pay,
    selected_brands: brands,
    created_at: authRow.created_at || profile.created_at || null,
    transaction_phone: "",
  };
}

function loadAuthRow(userId, callback) {
  db.query(`SELECT ${USER_AUTH_COLS} FROM users WHERE id = ?`, [userId], callback);
}

function buildPublicUser(userId, role, callback) {
  loadAuthRow(userId, (err, urows) => {
    if (err || !urows || !urows[0]) return callback(err || new Error("User not found"));

    const auth = urows[0];

    if (role === "admin") {
      return callback(
        null,
        shapePublicUser(auth, {
          full_name: auth.account_display_name || "Administrator",
          country: "Tanzania",
          city: "Dar es Salaam",
          area: "HQ",
          gps: "",
          profile_image: null,
          latitude: null,
          longitude: null,
          payment_methods: null,
          selected_brands: [],
          created_at: auth.created_at,
        })
      );
    }

    if (role === "customer") {
      return db.query("SELECT * FROM customers WHERE user_id = ?", [userId], (e2, crows) => {
        if (e2) return callback(e2);
        const p = crows && crows[0] ? crows[0] : {};
        callback(null, shapePublicUser(auth, p));
      });
    }

    if (role === "supplier") {
      return db.query("SELECT * FROM suppliers WHERE user_id = ?", [userId], (e2, srows) => {
        if (e2) return callback(e2);
        const p = srows && srows[0] ? srows[0] : {};
        callback(null, shapePublicUser(auth, p));
      });
    }

    if (role === "driver" || role === "delivery_guy") {
      return fetchDeliveryGuyProfile(userId, (e2, dg) => {
        if (e2) return callback(e2);
        const profile = {
          full_name: dg.full_name,
          country: "",
          city: dg.city,
          area: dg.area,
          gps: "",
          profile_image: null,
          latitude: dg.latitude,
          longitude: dg.longitude,
          payment_methods: null,
          selected_brands: [],
        };
        const authOut = { ...auth, role: role === "driver" ? "delivery_guy" : auth.role };
        callback(null, {
          ...shapePublicUser(authOut, profile),
          phone: dg.phone || auth.phone,
          plate_number: dg.plate_number,
          driving_license: dg.vehicle_type,
          vehicle_type: dg.vehicle_type,
          delivery_status: dg.status,
          delivery_guy_id: dg.id,
        });
      });
    }

    callback(new Error("Unknown role"));
  });
}

function upsertDeliveryGuy(userId, data, callback) {
  const { full_name, phone, city, area, vehicle_type, plate_number, latitude, longitude, status } = data;

  db.query(
    `INSERT INTO delivery_guy (user_id, full_name, phone, city, area, vehicle_type, plate_number, latitude, longitude, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
     full_name = VALUES(full_name),
     phone = VALUES(phone),
     city = VALUES(city),
     area = VALUES(area),
     vehicle_type = VALUES(vehicle_type),
     plate_number = VALUES(plate_number),
     latitude = VALUES(latitude),
     longitude = VALUES(longitude),
     status = VALUES(status)`,
    [userId, full_name, phone, city, area, vehicle_type, plate_number, latitude, longitude, status || "available"],
    (err, result) => {
      if (err) return callback(err);
      callback(null, result);
    }
  );
}

function getUserWithProfile(userId, callback) {
  loadAuthRow(userId, (err, urows) => {
    if (err || !urows || !urows[0]) return callback(err || new Error("User not found"));
    const auth = urows[0];
    buildPublicUser(userId, auth.role, callback);
  });
}

module.exports = {
  selectUserForLogin,
  buildPublicUser,
  upsertDeliveryGuy,
  getUserWithProfile
};
