const TABLES = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(190) PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS pricing_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    version VARCHAR(32) NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'TZS',
    base_fee DECIMAL(12,2) NOT NULL DEFAULT 1500,
    rate_per_km DECIMAL(12,2) NOT NULL DEFAULT 800,
    minimum_fee DECIMAL(12,2) NOT NULL DEFAULT 2000,
    maximum_distance_km DECIMAL(10,2) NOT NULL DEFAULT 100,
    zone_surcharge DECIMAL(12,2) NOT NULL DEFAULT 0,
    time_surcharge DECIMAL(12,2) NOT NULL DEFAULT 0,
    fallback_policy ENUM('reject','straight_line') NOT NULL DEFAULT 'reject',
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_by INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pricing_rules_active (active, created_at)
  )`,
  `CREATE TABLE IF NOT EXISTS route_quote_cache (
    cache_key CHAR(64) PRIMARY KEY,
    origin_lat DECIMAL(10,8) NOT NULL,
    origin_lng DECIMAL(11,8) NOT NULL,
    destination_lat DECIMAL(10,8) NOT NULL,
    destination_lng DECIMAL(11,8) NOT NULL,
    distance_meters INT NOT NULL,
    duration_seconds INT NULL,
    provider VARCHAR(32) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_route_cache_expiry (expires_at)
  )`,
  `CREATE TABLE IF NOT EXISTS order_quotes (
    id CHAR(36) PRIMARY KEY,
    customer_id INT NOT NULL,
    supplier_id INT NOT NULL,
    brand VARCHAR(128) NOT NULL,
    size VARCHAR(64) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    order_type VARCHAR(32) NOT NULL DEFAULT 'refill',
    destination_lat DECIMAL(10,8) NOT NULL,
    destination_lng DECIMAL(11,8) NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    delivery_fee DECIMAL(12,2) NOT NULL,
    discount DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL,
    road_distance_km DECIMAL(10,3) NOT NULL,
    route_duration_seconds INT NULL,
    route_provider VARCHAR(32) NOT NULL,
    pricing_rule_id INT NOT NULL,
    pricing_rule_version VARCHAR(32) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    consumed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_order_quotes_customer (customer_id, expires_at),
    INDEX idx_order_quotes_supplier (supplier_id, expires_at)
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    order_id INT NULL,
    type VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message VARCHAR(1024) NOT NULL,
    deep_link VARCHAR(255) NULL,
    payload_json JSON NULL,
    read_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_notifications_user_unread (user_id, read_at, created_at),
    INDEX idx_notifications_order (order_id)
  )`,
  `CREATE TABLE IF NOT EXISTS driver_offers (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    driver_id INT NOT NULL,
    offered_by INT NOT NULL,
    status ENUM('pending','accepted','declined','expired','cancelled') NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMP NOT NULL,
    responded_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_driver_offers_driver (driver_id, status, expires_at),
    INDEX idx_driver_offers_order (order_id, status)
  )`,
  `CREATE TABLE IF NOT EXISTS delivery_verifications (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL UNIQUE,
    code_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_delivery_verification_expiry (expires_at)
  )`,
  `CREATE TABLE IF NOT EXISTS order_status_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    from_status VARCHAR(32) NULL,
    to_status VARCHAR(32) NOT NULL,
    actor_user_id INT NULL,
    reason VARCHAR(512) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_order_history_order (order_id, created_at)
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor_user_id INT NULL,
    action VARCHAR(96) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(64) NULL,
    metadata_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_entity (entity_type, entity_id, created_at),
    INDEX idx_audit_actor (actor_user_id, created_at)
  )`,
  `CREATE TABLE IF NOT EXISTS seller_location_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    supplier_id INT NOT NULL,
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    source VARCHAR(32) NOT NULL,
    accuracy_meters DECIMAL(10,2) NULL,
    changed_by INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_seller_location_history (supplier_id, created_at)
  )`,
];

const COLUMNS = {
  users: {
    is_phone_verified: "TINYINT(1) NOT NULL DEFAULT 1",
    updated_at: "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
  },
  suppliers: {
    active: "TINYINT(1) NOT NULL DEFAULT 1",
    approved: "TINYINT(1) NOT NULL DEFAULT 1",
    verified: "TINYINT(1) NOT NULL DEFAULT 0",
    landmark: "VARCHAR(255) NULL",
    service_radius_km: "DECIMAL(10,2) NOT NULL DEFAULT 50",
    open_status: "VARCHAR(32) NOT NULL DEFAULT 'open'",
    location_source: "VARCHAR(32) NULL",
    location_accuracy_meters: "DECIMAL(10,2) NULL",
    location_updated_at: "TIMESTAMP NULL",
  },
  delivery_guy: {
    approved: "TINYINT(1) NOT NULL DEFAULT 1",
    online: "TINYINT(1) NOT NULL DEFAULT 0",
    location_accuracy_meters: "DECIMAL(10,2) NULL",
    location_updated_at: "TIMESTAMP NULL",
  },
  gas_prices: {
    stock_quantity: "INT NOT NULL DEFAULT 0",
    available: "TINYINT(1) NOT NULL DEFAULT 1",
    product_type: "VARCHAR(32) NOT NULL DEFAULT 'refill'",
  },
  otp_codes: {
    purpose: "VARCHAR(32) NOT NULL DEFAULT 'registration'",
    attempts: "INT NOT NULL DEFAULT 0",
  },
  orders: {
    quantity: "INT NOT NULL DEFAULT 1",
    order_type: "VARCHAR(32) NOT NULL DEFAULT 'refill'",
    unit_price: "DECIMAL(12,2) NULL",
    item_subtotal: "DECIMAL(12,2) NULL",
    delivery_fee: "DECIMAL(12,2) NOT NULL DEFAULT 0",
    discount: "DECIMAL(12,2) NOT NULL DEFAULT 0",
    total_amount: "DECIMAL(12,2) NULL",
    road_distance_km: "DECIMAL(10,3) NULL",
    route_duration_seconds: "INT NULL",
    route_provider: "VARCHAR(32) NULL",
    pricing_rule_id: "INT NULL",
    pricing_rule_version: "VARCHAR(32) NULL",
    quote_id: "CHAR(36) NULL",
    quote_timestamp: "TIMESTAMP NULL",
    idempotency_key: "VARCHAR(128) NULL",
    location_selected_method: "VARCHAR(32) NULL",
    location_accuracy_meters: "DECIMAL(10,2) NULL",
    rejection_reason: "VARCHAR(512) NULL",
    accepted_at: "TIMESTAMP NULL",
    assigned_at: "TIMESTAMP NULL",
    picked_up_at: "TIMESTAMP NULL",
    arrived_at: "TIMESTAMP NULL",
    delivered_at: "TIMESTAMP NULL",
    cancelled_at: "TIMESTAMP NULL",
    payment_status: "VARCHAR(32) NOT NULL DEFAULT 'unpaid'",
    payment_method: "VARCHAR(64) NULL",
    payment_submitted_at: "TIMESTAMP NULL",
    payment_confirmed_at: "TIMESTAMP NULL",
  },
};

async function columnExists(db, table, column) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows[0]?.count || 0) > 0;
}

async function indexExists(db, table, index) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS count FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, index]
  );
  return Number(rows[0]?.count || 0) > 0;
}

async function up(db) {
  for (const statement of TABLES) await db.query(statement);
  for (const [table, columns] of Object.entries(COLUMNS)) {
    for (const [column, definition] of Object.entries(columns)) {
      if (!(await columnExists(db, table, column))) {
        await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      }
    }
  }
  if (!(await indexExists(db, "orders", "uq_orders_idempotency"))) {
    await db.query("CREATE UNIQUE INDEX uq_orders_idempotency ON orders (customer_id, idempotency_key)");
  }
  if (!(await indexExists(db, "delivery_guy", "idx_driver_dispatch"))) {
    await db.query("CREATE INDEX idx_driver_dispatch ON delivery_guy (approved, online, status, location_updated_at)");
  }
  if (!(await indexExists(db, "suppliers", "idx_supplier_discovery"))) {
    await db.query("CREATE INDEX idx_supplier_discovery ON suppliers (active, approved, city, area)");
  }
  await db.query(
    `INSERT INTO pricing_rules
      (version, base_fee, rate_per_km, minimum_fee, maximum_distance_km, fallback_policy, active)
     SELECT 'v1', ?, ?, ?, ?, ?, 1
     WHERE NOT EXISTS (SELECT 1 FROM pricing_rules WHERE active = 1)`,
    [
      Number(process.env.DELIVERY_BASE_FEE || 1500),
      Number(process.env.DELIVERY_RATE_PER_KM || 800),
      Number(process.env.DELIVERY_MINIMUM_FEE || 2000),
      Number(process.env.DELIVERY_MAX_DISTANCE_KM || 100),
      process.env.ROUTING_FALLBACK_POLICY === "straight_line" ? "straight_line" : "reject",
    ]
  );
  await db.query(
    `UPDATE orders
     SET unit_price = COALESCE(unit_price, price),
         item_subtotal = COALESCE(item_subtotal, price),
         total_amount = COALESCE(total_amount, price)
     WHERE unit_price IS NULL OR item_subtotal IS NULL OR total_amount IS NULL`
  );
}

module.exports = { name: "001_cgd_delivery_workflow", up };
