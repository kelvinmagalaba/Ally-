const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("../config/db");
const { safeUser } = require("../utils/safeUser");
const { buildPublicUser, upsertDeliveryGuy } = require("../utils/authProfile");
const { normalizeTanzaniaPhone, isValidTanzaniaPhone } = require("../utils/phone");
const { issueAuthToken } = require("../utils/authToken");
const { isValidLatitude, isValidLongitude } = require("../utils/coordinates");

// Import OTP functions
const otpController = require("./otpController");

function str(v, fallback = "") {
  if (v == null) return fallback;
  const s = String(v).trim();
  return s === "" ? fallback : s;
}

/**
 * Display name for profile tables.
 * API may send fullName (camelCase) or full_name (snake_case); DB columns are full_name everywhere.
 */
function profileFullName(body) {
  const n = str(body.fullName, "") || str(body.full_name, "") || str(body.name, "");
  return n || "";
}

function rollbackUser(userId, callback) {
  db.query("DELETE FROM users WHERE id = ?", [userId], () => callback());
}

/**
 * POST /auth/register
 * 1) INSERT users — email, phone, password_hash, role only (auth).
 * 2) INSERT role profile — customers / suppliers / delivery_guy (correct column names per table).
 */
exports.register = (req, res) => {
  const body = req.body || {};
  const password = body.password;
  const roleRaw = body.role;
  const country = str(body.country, "");
  const city = str(body.city, "");
  const area = str(body.area, "");
  const gps = str(body.gps, "");
  const profileImage = body.profile_image != null ? body.profile_image : null;
  const lat =
    body.latitude != null && body.latitude !== "" && !Number.isNaN(Number(body.latitude))
      ? Number(body.latitude)
      : null;
  const lng =
    body.longitude != null && body.longitude !== "" && !Number.isNaN(Number(body.longitude))
      ? Number(body.longitude)
      : null;

  const emailInput = str(body.email, "").toLowerCase();
  const phoneInput = normalizeTanzaniaPhone(body.phone);

  if (!password || String(password).length < 8) {
    return res.status(400).json({ success: false, message: "Password is required (minimum 8 characters)" });
  }
  if (!emailInput || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput)) {
    return res.status(400).json({ success: false, message: "A valid email is required" });
  }
  if (!isValidTanzaniaPhone(phoneInput)) {
    return res.status(400).json({ success: false, message: "A valid Tanzania mobile number is required for OTP verification" });
  }
  if ((lat != null && !isValidLatitude(lat)) || (lng != null && !isValidLongitude(lng)) || ((lat == null) !== (lng == null))) {
    return res.status(400).json({ success: false, message: "Provide both valid latitude and longitude, or leave both empty" });
  }

  const roleMap = {
    customer: "customer",
    supplier: "supplier",
    driver: "delivery_guy",
    delivery_guy: "delivery_guy",
  };
  const dbRole = roleMap[roleRaw] || "customer";

  const usersEmail =
    emailInput ||
    `phone_${phoneInput.replace(/\W/g, "") || "user"}_${crypto.randomBytes(4).toString("hex")}@phone.gas.local`;

  const usersPhone = phoneInput;
  const displayName = profileFullName(body) || (emailInput ? emailInput.split("@")[0] : usersPhone || "User");

  const dupSql =
    usersPhone !== ""
      ? "SELECT id FROM users WHERE email = ? OR phone = ? LIMIT 1"
      : "SELECT id FROM users WHERE email = ? LIMIT 1";
  const dupParams = usersPhone !== "" ? [usersEmail, usersPhone] : [usersEmail];

  db.query(dupSql, dupParams, (dupErr, dupRows) => {
      if (dupErr) return res.status(500).json({ success: false, message: dupErr.message });
      if (dupRows && dupRows.length > 0) {
        return res.json({ success: false, message: "An account with this email or phone already exists" });
      }

      const password_hash = bcrypt.hashSync(String(password), 10);
      const payJson = body.paymentMethods != null ? JSON.stringify(body.paymentMethods) : null;
      const brandsJson = body.selectedBrands != null ? JSON.stringify(body.selectedBrands) : null;

      db.query(
        "INSERT INTO users (email, phone, password_hash, role, is_phone_verified) VALUES (?, ?, ?, ?, 0)",
        [usersEmail, usersPhone, password_hash, dbRole],
        (insErr, ins) => {
          if (insErr) {
            console.error("register users INSERT:", insErr);
            return res.status(500).json({ success: false, message: insErr.message });
          }

          const userId = ins.insertId;

          const finish = () => {
            buildPublicUser(userId, dbRole, async (e2, full) => {
              if (e2 || !full) {
                return res.status(500).json({ success: false, message: "Could not load the new account" });
              }
              try {
                const otp = await otpController.createAndSendOTP(usersPhone, "registration");
                res.status(201).json({
                  success: true,
                  requiresOTP: true,
                  message: otp.sent ? "Account created. OTP sent by SMS." : "Account created. Development OTP generated.",
                  phone: usersPhone,
                  devCode: otp.devCode,
                  user: safeUser(full),
                });
              } catch (otpError) {
                res.status(otpError.statusCode || 503).json({
                  success: false,
                  accountCreated: true,
                  requiresOTP: true,
                  phone: usersPhone,
                  message: `Account created, but OTP could not be sent: ${otpError.message}`,
                });
              }
            });
          };

          const onProfileError = (e3) => {
            console.error("register profile INSERT:", e3);
            rollbackUser(userId, () => {
              res.status(500).json({ success: false, message: e3.message || "Profile creation failed" });
            });
          };

          if (dbRole === "customer") {
            return db.query(
              `INSERT INTO customers (user_id, full_name, country, city, area, gps, profile_image, latitude, longitude, payment_methods)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [userId, displayName, country, city, area, gps, profileImage, lat, lng, payJson],
              (e3) => {
                if (e3) return onProfileError(e3);
                finish();
              }
            );
          }

          if (dbRole === "supplier") {
            return db.query(
              `INSERT INTO suppliers (user_id, full_name, country, city, area, gps, profile_image, latitude, longitude, payment_methods, selected_brands)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [userId, displayName, country, city, area, gps, profileImage, lat, lng, payJson, brandsJson],
              (e3) => {
                if (e3) return onProfileError(e3);
                finish();
              }
            );
          }

          if (dbRole === "delivery_guy") {
            const plate = str(body.plateNumber, "") || str(body.plate_number, "");
            const vehicle = str(body.drivingLicense, "") || str(body.driving_license, "") || str(body.vehicle_type, "");
            return upsertDeliveryGuy(
              userId,
              {
                full_name: displayName,
                phone: usersPhone,
                city,
                area,
                vehicle_type: vehicle,
                plate_number: plate,
                latitude: lat,
                longitude: lng,
                status: "available",
              },
              (dErr) => {
                if (dErr) return onProfileError(dErr);
                finish();
              }
            );
          }

          rollbackUser(userId, () => {
            res.status(500).json({ success: false, message: "Unknown role — registration rolled back" });
          });
        }
      );
    });
};

exports.login = async (req, res) => {
  const { email, password, phone } = req.body || {};
  const identifier = str(email || phone || "", "");
  if (!identifier || !password) {
    return res.status(400).json({ success: false, message: "Email or phone and password required" });
  }
  try {
    const normalizedPhone = normalizeTanzaniaPhone(identifier);
    const [rows] = await db.query(
      `SELECT id, email, phone, password_hash, role, is_phone_verified
       FROM users WHERE LOWER(email) = LOWER(?) OR phone IN (?, ?) LIMIT 1`,
      [identifier, normalizedPhone, identifier]
    );
    const user = rows[0];
    if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }
    if (!user.is_phone_verified && user.role !== "admin") {
      let otp = {};
      try {
        otp = await otpController.createAndSendOTP(user.phone, "registration");
      } catch (error) {
        if (error.statusCode !== 429) throw error;
      }
      return res.json({
        success: true,
        requiresOTP: true,
        phone: user.phone,
        message: "Finish phone verification to activate this account",
        devCode: otp.devCode,
      });
    }
    buildPublicUser(user.id, user.role, (profileError, full) => {
      if (profileError || !full) return res.status(500).json({ success: false, message: "Could not load account profile" });
      return res.json({
        success: true,
        requiresOTP: false,
        message: "Login successful",
        token: issueAuthToken(user),
        user: safeUser(full),
      });
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message || "Login failed" });
  }
};

exports.verifyLoginOTP = async (req, res) => {
  const { phone, code } = req.body || {};
  if (!phone || !code) {
    return res.status(400).json({ success: false, message: "Phone and code required" });
  }
  try {
    const cleanPhone = normalizeTanzaniaPhone(phone);
    const valid = await otpController.consumeOTP(cleanPhone, code, "registration");
    if (!valid) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP code" });
    }
    const [userRows] = await db.query("SELECT id, role FROM users WHERE phone = ? LIMIT 1", [cleanPhone]);
    if (!userRows[0]) {
      return res.status(400).json({ success: false, message: "User not found" });
    }
    const userRow = userRows[0];
    await db.query("UPDATE users SET is_phone_verified = 1 WHERE id = ?", [userRow.id]);
    buildPublicUser(userRow.id, userRow.role, (e2, full) => {
      if (e2 || !full) {
        return res.status(500).json({ success: false, message: "Could not load profile" });
      }
      const selectedBrands = full.selected_brands || [];
      res.json({
        success: true,
        message: "Phone verified successfully",
        token: issueAuthToken(userRow),
        user: safeUser(full),
        needsBrandSelection: userRow.role === "supplier" && (!Array.isArray(selectedBrands) || selectedBrands.length === 0),
      });
    });
  } catch (error) {
    console.error("Error in verifyLoginOTP:", error);
    res.status(500).json({ success: false, message: "Phone verification failed" });
  }
};

exports.updateSettings = async (req, res) => {
  const body = req.body || {};
  const userId = req.auth.id;
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query("SELECT * FROM users WHERE id = ? FOR UPDATE", [userId]);
    const account = rows[0];
    if (!account) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Account not found" });
    }
    const changesLogin = body.email !== undefined || body.phone !== undefined || body.newPassword;
    if (changesLogin && !bcrypt.compareSync(String(body.currentPassword || ""), account.password_hash)) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: "Current password is incorrect" });
    }
    const email = body.email !== undefined ? String(body.email).trim().toLowerCase() : account.email;
    const phone = body.phone !== undefined ? normalizeTanzaniaPhone(body.phone) : account.phone;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Enter a valid email" });
    }
    if (!isValidTanzaniaPhone(phone)) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Enter a valid Tanzania mobile number" });
    }
    if (body.newPassword && String(body.newPassword).length < 8) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "New password must have at least 8 characters" });
    }
    const phoneChanged = phone !== account.phone;
    const passwordHash = body.newPassword ? bcrypt.hashSync(String(body.newPassword), 12) : account.password_hash;
    await connection.query(
      `UPDATE users SET email = ?, phone = ?, password_hash = ?,
       is_phone_verified = CASE WHEN ? THEN 0 ELSE is_phone_verified END WHERE id = ?`,
      [email, phone, passwordHash, phoneChanged ? 1 : 0, userId]
    );
    const fullName = body.fullName != null ? String(body.fullName).trim().slice(0, 255) : null;
    if (fullName) {
      if (account.role === "admin") {
        await connection.query("UPDATE users SET account_display_name = ? WHERE id = ?", [fullName, userId]);
      } else {
        const table = account.role === "customer" ? "customers" : account.role === "supplier" ? "suppliers" : "delivery_guy";
        await connection.query(`UPDATE \`${table}\` SET full_name = ? WHERE user_id = ?`, [fullName, userId]);
      }
    }
    await connection.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, 'account_settings_changed', 'user', ?, ?)`,
      [userId, String(userId), JSON.stringify({ emailChanged: email !== account.email, phoneChanged, passwordChanged: Boolean(body.newPassword), nameChanged: Boolean(fullName) })]
    );
    await connection.commit();
    let otp = null;
    if (phoneChanged) otp = await otpController.createAndSendOTP(phone, "registration");
    buildPublicUser(userId, account.role, (error, full) => {
      if (error || !full) return res.status(500).json({ success: false, message: "Settings saved but profile reload failed" });
      res.json({
        success: true,
        message: phoneChanged ? "Settings saved. Verify your new phone number." : "Settings saved",
        requiresOTP: phoneChanged,
        devCode: otp?.devCode,
        user: safeUser(full),
      });
    });
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, message: "Email or phone already belongs to another account" });
    res.status(500).json({ success: false, message: error.message || "Could not save settings" });
  } finally {
    connection.release();
  }
};
