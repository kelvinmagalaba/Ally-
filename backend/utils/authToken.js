const crypto = require("crypto");

const DEV_SECRET = "cgd-development-only-change-before-production";

function secret() {
  const configured = String(process.env.AUTH_TOKEN_SECRET || "");
  if (process.env.NODE_ENV === "production" && configured.length < 32) {
    throw new Error("AUTH_TOKEN_SECRET must be at least 32 characters in production");
  }
  return configured || DEV_SECRET;
}

function encode(value) {
  return Buffer.from(value).toString("base64url");
}

function signPart(value) {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

function issueAuthToken(user, ttlSeconds = Number(process.env.AUTH_TOKEN_TTL_SECONDS || 43200)) {
  const now = Math.floor(Date.now() / 1000);
  const header = encode(JSON.stringify({ alg: "HS256", typ: "CGD" }));
  const payload = encode(
    JSON.stringify({ sub: Number(user.id), role: String(user.role), iat: now, exp: now + ttlSeconds })
  );
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${signPart(unsigned)}`;
}

function verifyAuthToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Invalid authentication token");
  const unsigned = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(signPart(unsigned));
  const received = Buffer.from(parts[2]);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    throw new Error("Invalid authentication token");
  }
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (!payload.sub || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error("Authentication token expired");
  }
  return { id: Number(payload.sub), role: String(payload.role), exp: Number(payload.exp) };
}

module.exports = { issueAuthToken, verifyAuthToken };
