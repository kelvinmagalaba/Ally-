const crypto = require("crypto");
const db = require("../config/db");
const { normalizeTanzaniaPhone, isValidTanzaniaPhone } = require("../utils/phone");

const AfricasTalking = require("africastalking")({
  apiKey: process.env.AFRICASTALKING_API_KEY || "not-configured",
  username: process.env.AFRICASTALKING_USERNAME || "sandbox",
});

function generateCode() {
  return String(crypto.randomInt(100000, 1000000));
}

async function sendOtpSms(phone, code) {
  const skipSms = process.env.SKIP_OTP_SMS === "true" || process.env.NODE_ENV !== "production";
  if (skipSms) return { sent: false, development: true };
  if (!process.env.AFRICASTALKING_API_KEY || !process.env.AFRICASTALKING_USERNAME) {
    throw new Error("SMS provider is not configured");
  }
  await AfricasTalking.SMS.send({
    to: [phone],
    message: `Your CGD Cooking Gas Delivery verification code is ${code}. It expires in 5 minutes.`,
  });
  return { sent: true, development: false };
}

async function createAndSendOTP(phoneInput, purpose = "registration") {
  const phone = normalizeTanzaniaPhone(phoneInput);
  if (!isValidTanzaniaPhone(phone)) {
    throw Object.assign(new Error("Enter a valid Tanzania mobile number"), { statusCode: 400 });
  }
  const [recent] = await db.query(
    `SELECT created_at FROM otp_codes WHERE phone = ? AND purpose = ?
     AND created_at > DATE_SUB(NOW(), INTERVAL 60 SECOND)
     ORDER BY created_at DESC LIMIT 1`,
    [phone, purpose]
  );
  if (recent[0]) {
    throw Object.assign(new Error("Please wait before requesting another OTP"), { statusCode: 429 });
  }
  const code = generateCode();
  await db.query("UPDATE otp_codes SET is_used = TRUE WHERE phone = ? AND purpose = ? AND is_used = FALSE", [phone, purpose]);
  const [result] = await db.query(
    `INSERT INTO otp_codes (phone, code, purpose, expires_at)
     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))`,
    [phone, code, purpose]
  );
  try {
    const delivery = await sendOtpSms(phone, code);
    return {
      phone,
      sent: delivery.sent,
      devCode: delivery.development ? code : undefined,
    };
  } catch (error) {
    await db.query("DELETE FROM otp_codes WHERE id = ?", [result.insertId]);
    throw error;
  }
}

async function consumeOTP(phoneInput, code, purpose = "registration") {
  const phone = normalizeTanzaniaPhone(phoneInput);
  const [rows] = await db.query(
    `SELECT * FROM otp_codes WHERE phone = ? AND code = ? AND purpose = ?
     AND is_used = FALSE AND expires_at > NOW() ORDER BY id DESC LIMIT 1`,
    [phone, String(code || "").trim(), purpose]
  );
  if (!rows[0]) return false;
  const [updated] = await db.query("UPDATE otp_codes SET is_used = TRUE WHERE id = ? AND is_used = FALSE", [rows[0].id]);
  return updated.affectedRows === 1;
}

exports.generateOTP = async (req, res) => {
  try {
    const result = await createAndSendOTP(req.body?.phone, req.body?.purpose || "registration");
    res.json({ success: true, message: result.sent ? "OTP sent by SMS" : "Development OTP generated", devCode: result.devCode });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || "Failed to send OTP" });
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const valid = await consumeOTP(req.body?.phone, req.body?.code || req.body?.otp, req.body?.purpose || "registration");
    if (!valid) return res.status(400).json({ success: false, message: "Invalid or expired OTP code" });
    res.json({ success: true, message: "OTP verified successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to verify OTP" });
  }
};

exports.cleanupExpiredOTPs = async () => {
  await db.query("DELETE FROM otp_codes WHERE expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY)");
};

exports.createAndSendOTP = createAndSendOTP;
exports.consumeOTP = consumeOTP;
exports.generateCode = generateCode;
