require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const os = require("os");
const db = require("./config/db");
const socketHub = require("./utils/socketHub");
const { verifyAuthToken } = require("./utils/authToken");
const { validateCoordinates } = require("./utils/coordinates");
const { haversineKm } = require("./utils/geo");
const { createNotification } = require("./services/notificationService");
const { ensureSchema } = require("./config/initDb");
const { runMigrations } = require("./scripts/migrate");

const app = express();
const PORT = Number(process.env.PORT || 5000);
const HOST = "0.0.0.0";

function getLocalIP() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return "127.0.0.1";
}

const allowedOrigins = String(process.env.CORS_ORIGINS || "http://localhost:8080,http://127.0.0.1:8080")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== "production") return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS"));
  },
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "15mb" }));
app.use("/uploads", express.static("uploads"));

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/orders", require("./routes/orderRoutes"));
app.use("/api/transactions", require("./routes/transactionRoutes"));
app.use("/api/receipts", require("./routes/receiptRoutes"));
app.use("/api/locations", require("./routes/locationRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/messages", require("./routes/messageRoutes"));
app.use("/api/conversations", require("./routes/conversationRoutes"));
app.use("/api/suppliers", require("./routes/supplierRoutes"));
app.use("/api/gas-prices", require("./routes/pricingRoutes"));
app.use("/api/otp", require("./routes/otpRoutes"));
app.use("/api/user", require("./routes/userRoutes"));
app.use("/api/workflow", require("./routes/workflowRoutes"));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, application: "CGD — Cooking Gas Delivery", ip: getLocalIP(), port: PORT });
});

app.use((error, _req, res, _next) => {
  console.error("Unhandled request error:", error);
  res.status(error.statusCode || 500).json({ message: error.message || "Unexpected server error" });
});

const server = http.createServer(app);
const io = new Server(server, { cors: corsOptions });
socketHub.setIo(io);

async function canAccessOrder(user, orderId) {
  const [rows] = await db.query(
    `SELECT o.customer_id, o.supplier_id, dg.user_id AS driver_user_id
     FROM orders o LEFT JOIN delivery_guy dg ON dg.id = o.driver_id WHERE o.id = ?`,
    [orderId]
  );
  const order = rows[0];
  if (!order) return false;
  return user.role === "admin" || Number(order.customer_id) === user.id ||
    Number(order.supplier_id) === user.id || Number(order.driver_user_id) === user.id;
}

io.use(async (socket, next) => {
  try {
    const decoded = verifyAuthToken(socket.handshake.auth?.token);
    const [rows] = await db.query("SELECT id, role FROM users WHERE id = ?", [decoded.id]);
    if (!rows[0]) return next(new Error("Account not found"));
    socket.user = { id: Number(rows[0].id), role: String(rows[0].role) };
    next();
  } catch (error) {
    next(new Error("Authentication required"));
  }
});

const lastLocationAt = new Map();

io.on("connection", (socket) => {
  const user = socket.user;
  socket.join(`user_${user.id}`);

  socket.on("join", (requestedUserId, acknowledge) => {
    const ok = Number(requestedUserId) === user.id;
    if (ok) socket.join(`user_${user.id}`);
    if (typeof acknowledge === "function") acknowledge({ ok });
  });

  const joinOrder = async (rawOrderId, acknowledge) => {
    try {
      const orderId = Number(rawOrderId?.orderId ?? rawOrderId?.order_id ?? rawOrderId);
      if (!Number.isInteger(orderId) || !(await canAccessOrder(user, orderId))) {
        if (typeof acknowledge === "function") acknowledge({ ok: false, message: "Not allowed" });
        return;
      }
      socket.join(`order_${orderId}`);
      const [locations] = await db.query(
        `SELECT latitude AS lat, longitude AS lng, created_at AS timestamp
         FROM locations WHERE order_id = ? ORDER BY created_at DESC LIMIT 1`,
        [orderId]
      );
      if (locations[0]) socket.emit("driver_location_updated", { orderId, ...locations[0], recovered: true });
      if (typeof acknowledge === "function") acknowledge({ ok: true });
    } catch {
      if (typeof acknowledge === "function") acknowledge({ ok: false });
    }
  };
  socket.on("joinOrder", joinOrder);
  socket.on("join_order", joinOrder);

  const publishDriverLocation = async (data, acknowledge) => {
    try {
      if (!["delivery_guy", "driver"].includes(user.role)) throw Object.assign(new Error("Only drivers can publish delivery GPS"), { statusCode: 403 });
      const orderId = Number(data?.orderId ?? data?.order_id);
      const { lat, lng } = validateCoordinates(data?.lat ?? data?.latitude, data?.lng ?? data?.longitude);
      const clientTimestamp = data?.timestamp == null
        ? Date.now()
        : typeof data.timestamp === "number"
          ? data.timestamp
          : Date.parse(String(data.timestamp));
      if (!Number.isFinite(clientTimestamp) || Math.abs(Date.now() - clientTimestamp) > 5 * 60 * 1000) {
        throw new Error("Location timestamp is invalid or stale");
      }
      const minInterval = Math.max(3000, Number(process.env.DRIVER_LOCATION_MIN_INTERVAL_MS || 5000));
      const last = lastLocationAt.get(user.id) || 0;
      if (Date.now() - last < minInterval) {
        if (typeof acknowledge === "function") acknowledge({ ok: false, throttled: true });
        return;
      }
      const [orders] = await db.query(
        `SELECT o.*, dg.id AS driver_pk, dg.online, dg.user_id AS driver_user_id
         FROM orders o INNER JOIN delivery_guy dg ON dg.id = o.driver_id
         WHERE o.id = ? AND dg.user_id = ? AND o.status IN ('driver_assigned','picked_up','in_transit','arrived')`,
        [orderId, user.id]
      );
      const order = orders[0];
      if (!order || !order.online) throw Object.assign(new Error("No authorized active delivery, or driver is offline"), { statusCode: 403 });
      lastLocationAt.set(user.id, Date.now());
      const rawAccuracy = data?.accuracy == null ? null : Number(data.accuracy);
      const accuracy = rawAccuracy != null && Number.isFinite(rawAccuracy) ? Math.max(0, rawAccuracy) : null;
      await db.query(
        "INSERT INTO locations (user_id, order_id, latitude, longitude) VALUES (?, ?, ?, ?)",
        [user.id, orderId, lat, lng]
      );
      await db.query(
        `UPDATE delivery_guy SET latitude = ?, longitude = ?, location_accuracy_meters = ?,
         location_updated_at = NOW() WHERE id = ?`,
        [lat, lng, accuracy, order.driver_pk]
      );
      await db.query("UPDATE orders SET delivery_lat = ?, delivery_lng = ? WHERE id = ?", [lat, lng, orderId]);
      const payload = {
        orderId,
        lat,
        lng,
        accuracy,
        timestamp: new Date().toISOString(),
        staleAfterSeconds: Number(process.env.TRACKING_STALE_SECONDS || 30),
      };
      io.to(`order_${orderId}`).emit("driver_location_updated", payload);
      // Compatibility aliases for existing installed clients.
      io.to(`order_${orderId}`).emit("deliveryLocationUpdate", payload);
      io.to(`order_${orderId}`).emit("liveDriverLocation", payload);

      if (order.status === "in_transit" && order.customer_lat != null && order.customer_lng != null) {
        const km = haversineKm(lat, lng, Number(order.customer_lat), Number(order.customer_lng));
        const thresholdKm = Math.max(0.05, Number(process.env.ARRIVAL_THRESHOLD_METERS || 250) / 1000);
        if (km <= thresholdKm) {
          const [existing] = await db.query(
            "SELECT id FROM notifications WHERE order_id = ? AND type = 'driver_nearby' LIMIT 1",
            [orderId]
          );
          if (!existing[0]) {
            await createNotification({
              userId: order.customer_id,
              orderId,
              type: "driver_nearby",
              title: "Driver is nearby",
              message: "Fresh GPS data shows your cooking gas delivery is close.",
              deepLink: `orders/${orderId}`,
            });
          }
        }
      }
      if (typeof acknowledge === "function") acknowledge({ ok: true });
    } catch (error) {
      if (typeof acknowledge === "function") acknowledge({ ok: false, message: error.message });
    }
  };
  socket.on("driver_location", publishDriverLocation);
  socket.on("deliveryLocation", publishDriverLocation);

  socket.on("disconnect", () => {
    lastLocationAt.delete(user.id);
  });
});

function initializeLegacySchema() {
  return new Promise((resolve, reject) => ensureSchema((error) => (error ? reject(error) : resolve())));
}

async function start() {
  await initializeLegacySchema();
  await runMigrations();
  const cleanup = async () => {
    const locationDays = Math.max(1, Number(process.env.LOCATION_RETENTION_DAYS || 30));
    const notificationDays = Math.max(30, Number(process.env.NOTIFICATION_RETENTION_DAYS || 365));
    await db.query(
      `DELETE l FROM locations l
       LEFT JOIN orders o ON o.id = l.order_id
       WHERE l.created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
       AND (o.id IS NULL OR o.status IN ('delivered','cancelled','rejected'))`,
      [locationDays]
    );
    await db.query(
      `DELETE FROM notifications WHERE read_at IS NOT NULL
       AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [notificationDays]
    );
  };
  cleanup().catch((error) => console.warn("Retention cleanup failed:", error.message));
  const cleanupTimer = setInterval(() => cleanup().catch((error) => console.warn("Retention cleanup failed:", error.message)), 24 * 60 * 60 * 1000);
  cleanupTimer.unref();
  server.listen(PORT, HOST, () => {
    console.log("CGD — Cooking Gas Delivery backend started");
    console.log(`Local:   http://localhost:${PORT}`);
    console.log(`Network: http://${getLocalIP()}:${PORT}`);
  });
}

server.on("error", (error) => {
  console.error("Server error:", error);
  process.exitCode = 1;
});

if (require.main === module) {
  start().catch((error) => {
    console.error("Backend startup failed:", error);
    process.exit(1);
  });
}

module.exports = { app, server, start, canAccessOrder };
