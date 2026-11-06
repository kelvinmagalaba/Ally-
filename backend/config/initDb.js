const db = require("./db");
require("dotenv").config();

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(64) DEFAULT '',
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('customer','supplier','driver','delivery_guy','admin') NOT NULL DEFAULT 'customer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS customers (
    user_id INT NOT NULL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL DEFAULT '',
    country VARCHAR(128) DEFAULT '',
    city VARCHAR(128) DEFAULT '',
    area VARCHAR(128) DEFAULT '',
    gps VARCHAR(512) DEFAULT '',
    profile_image LONGTEXT NULL,
    latitude DECIMAL(10,8) NULL,
    longitude DECIMAL(11,8) NULL,
    payment_methods JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_customers_user (user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS suppliers (
    user_id INT NOT NULL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL DEFAULT '',
    country VARCHAR(128) DEFAULT '',
    city VARCHAR(128) DEFAULT '',
    area VARCHAR(128) DEFAULT '',
    gps VARCHAR(512) DEFAULT '',
    profile_image LONGTEXT NULL,
    latitude DECIMAL(10,8) NULL,
    longitude DECIMAL(11,8) NULL,
    payment_methods JSON NULL,
    selected_brands JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_suppliers_user (user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS delivery_guy (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    full_name VARCHAR(255) DEFAULT '',
    phone VARCHAR(64) DEFAULT '',
    city VARCHAR(128) DEFAULT '',
    area VARCHAR(128) DEFAULT '',
    vehicle_type VARCHAR(128) DEFAULT '',
    plate_number VARCHAR(64) DEFAULT '',
    status VARCHAR(32) DEFAULT 'offline',
    latitude DECIMAL(10,8) NULL,
    longitude DECIMAL(11,8) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_delivery_guy_user (user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    supplier_id INT NULL,
    delivery_id INT NULL,
    brand VARCHAR(128),
    size VARCHAR(64),
    price DECIMAL(12,2) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    customer_lat DECIMAL(10,8) NULL,
    customer_lng DECIMAL(11,8) NULL,
    delivery_lat DECIMAL(10,8) NULL,
    delivery_lng DECIMAL(11,8) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_orders_customer (customer_id),
    INDEX idx_orders_supplier (supplier_id),
    INDEX idx_orders_delivery (delivery_id),
    INDEX idx_orders_status (status)
  )`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    user_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    payment_method VARCHAR(64),
    status VARCHAR(32) DEFAULT 'completed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tx_order (order_id),
    INDEX idx_tx_user (user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_id INT NOT NULL,
    receiver_id INT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS locations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    order_id INT NULL,
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_loc_order (order_id),
    INDEX idx_loc_user (user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS receipts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_id INT NOT NULL,
    order_id INT NOT NULL,
    user_id INT NOT NULL,
    pdf_base64 LONGTEXT NOT NULL,
    receipt_json JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_receipt_tx (transaction_id)
  )`,
  `CREATE TABLE IF NOT EXISTS reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    description TEXT NOT NULL,
    status ENUM('pending','in_progress','resolved') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_reports_user (user_id),
    INDEX idx_reports_status (status),
    INDEX idx_reports_location (latitude, longitude)
  )`,
  `CREATE TABLE IF NOT EXISTS gas_prices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    supplier_id INT NOT NULL,
    brand VARCHAR(128) NOT NULL,
    size VARCHAR(64) NOT NULL,
    price DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_gas_prices_supplier_brand_size (supplier_id, brand, size),
    INDEX idx_gas_prices_supplier (supplier_id),
    INDEX idx_gas_prices_brand (brand),
    CONSTRAINT fk_gas_prices_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(user_id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS otp_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    phone VARCHAR(64) NOT NULL,
    code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_otp_phone (phone),
    INDEX idx_otp_code (code),
    INDEX idx_otp_expires (expires_at)
  )`,
];

function runStatements(index, cb) {
  if (index >= statements.length) return cb(null);
  db.query(statements[index], (err) => {
    if (err) return cb(err);
    runStatements(index + 1, cb);
  });
}

function columnExists(table, column, cb) {
  db.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
    (err, rows) => {
      if (err) return cb(err, false);
      cb(null, rows[0] && Number(rows[0].c) > 0);
    }
  );
}

function tableExists(table, cb) {
  db.query(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
    (err, rows) => {
      if (err) return cb(err, false);
      cb(null, rows[0] && Number(rows[0].c) > 0);
    }
  );
}

/** Legacy: copy rows from old drivers table into delivery_guy */
function migrateDriversTableToDeliveryGuy(callback) {
  tableExists("drivers", (err, hasDrivers) => {
    if (err || !hasDrivers) return callback(null);
    tableExists("delivery_guy", (e2, hasDg) => {
      if (e2 || !hasDg) return callback(null);
      db.query(
        `INSERT IGNORE INTO delivery_guy (user_id, full_name, phone, plate_number, status, latitude, longitude)
         SELECT d.user_id,
                COALESCE(NULLIF(TRIM(u.email), ''), 'Driver'),
                COALESCE(u.phone, ''),
                COALESCE(d.plate_number, ''),
                'available',
                NULL,
                NULL
         FROM drivers d
         INNER JOIN users u ON u.id = d.user_id`,
        (e3) => {
          if (e3) console.warn("migrate drivers→delivery_guy:", e3.message);
          callback(null);
        }
      );
    });
  });
}

/** Legacy fat users: backfill profile rows when profile tables are empty for that user */
function backfillProfilesFromLegacyUsers(callback) {
  columnExists("users", "full_name", (err, hasLegacy) => {
    if (err || !hasLegacy) return callback(null);
    db.query(
      `INSERT IGNORE INTO customers (user_id, full_name, country, city, area, gps, profile_image, latitude, longitude, payment_methods)
       SELECT u.id, COALESCE(NULLIF(TRIM(u.full_name),''), u.email), COALESCE(u.country,''), COALESCE(u.city,''),
              COALESCE(u.area,''), COALESCE(u.gps,''), u.profile_image, u.latitude, u.longitude, u.payment_methods
       FROM users u WHERE u.role = 'customer'
         AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.user_id = u.id)`,
      (e1) => {
        if (e1) console.warn("backfill customers:", e1.message);
        function runDeliveryBackfill() {
          db.query(
            `INSERT IGNORE INTO delivery_guy (user_id, full_name, phone, city, area, vehicle_type, plate_number, status, latitude, longitude)
             SELECT u.id, COALESCE(NULLIF(TRIM(u.full_name),''), u.email), COALESCE(u.phone,''), COALESCE(u.city,''), COALESCE(u.area,''),
                    '', '', 'offline', u.latitude, u.longitude
             FROM users u WHERE u.role IN ('driver', 'delivery_guy')
               AND NOT EXISTS (SELECT 1 FROM delivery_guy dg WHERE dg.user_id = u.id)`,
            (e3) => {
              if (e3) console.warn("backfill delivery_guy:", e3.message);
              callback(null);
            }
          );
        }
        columnExists("users", "selected_brands", (eSb, hasSb) => {
          columnExists("users", "prices", (ePr, hasPr) => {
            const sbCol = !eSb && hasSb ? "u.selected_brands" : "NULL";
            const prCol = !ePr && hasPr ? "u.prices" : "NULL";
            db.query(
              `INSERT IGNORE INTO suppliers (user_id, full_name, country, city, area, gps, profile_image, latitude, longitude, payment_methods, selected_brands, prices)
               SELECT u.id, COALESCE(NULLIF(TRIM(u.full_name),''), u.email), COALESCE(u.country,''), COALESCE(u.city,''),
                      COALESCE(u.area,''), COALESCE(u.gps,''), u.profile_image, u.latitude, u.longitude, u.payment_methods, ${sbCol}, ${prCol}
               FROM users u WHERE u.role = 'supplier'
                 AND NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.user_id = u.id)`,
              (e2) => {
                if (e2) console.warn("backfill suppliers:", e2.message);
                runDeliveryBackfill();
              }
            );
          });
        });
      }
    );
  });
}

function addOrderColumnIfMissing(column, definition, cb) {
  columnExists("orders", column, (err, exists) => {
    if (err) return cb(err);
    if (exists) return cb(null);
    db.query(`ALTER TABLE orders ADD COLUMN \`${column}\` ${definition}`, cb);
  });
}

function ensureOrdersExtendedColumns(callback) {
  addOrderColumnIfMissing("transaction_phone", "VARCHAR(64) NULL", (e1) => {
    if (e1) return callback(e1);
    addOrderColumnIfMissing("receipt_code", "VARCHAR(64) NULL", (e2) => {
      if (e2) return callback(e2);
      addOrderColumnIfMissing("receipt_json", "LONGTEXT NULL", (e3) => {
        if (e3) return callback(e3);
        addOrderColumnIfMissing("receipt_pdf_base64", "LONGTEXT NULL", (e4) => {
          if (e4) return callback(e4);
          addOrderColumnIfMissing("driver_id", "INT NULL", (e5) => {
            if (e5) return callback(e5);
            // ---- Friend / recipient enhancements ----
            addOrderColumnIfMissing("is_for_friend", "TINYINT(1) NOT NULL DEFAULT 0", (e6) => {
              if (e6) return callback(e6);
              addOrderColumnIfMissing("recipient_name", "VARCHAR(255) NULL", (e7) => {
                if (e7) return callback(e7);
                addOrderColumnIfMissing("recipient_phone", "VARCHAR(64) NULL", (e8) => {
                  if (e8) return callback(e8);
                  addOrderColumnIfMissing("delivery_address", "VARCHAR(512) NULL", (e9) => {
                    if (e9) return callback(e9);
                    db.query(
                      "UPDATE orders SET driver_id = delivery_id WHERE driver_id IS NULL AND delivery_id IS NOT NULL",
                      (e10) => {
                        if (e10) console.warn("Backfill driver_id:", e10.message);
                        callback(null);
                      }
                    );
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

function addMessageColumnIfMissing(column, definition, cb) {
  columnExists("messages", column, (err, exists) => {
    if (err) return cb(err);
    if (exists) return cb(null);
    db.query(`ALTER TABLE messages ADD COLUMN \`${column}\` ${definition}`, cb);
  });
}

function ensureMessagesOrderColumns(callback) {
  addMessageColumnIfMissing("order_id", "INT NULL", (e1) => {
    if (e1) return callback(e1);
    addMessageColumnIfMissing("is_read", "TINYINT(1) NOT NULL DEFAULT 0", (e2) => {
      if (e2) return callback(e2);
      db.query("CREATE INDEX idx_messages_order_id ON messages (order_id)", (e3) => {
        if (e3 && !String(e3.message).includes("Duplicate")) console.warn("messages index:", e3.message);
        callback(null);
      });
    });
  });
}

function addUserColumnIfMissing(column, definition, cb) {
  columnExists("users", column, (err, exists) => {
    if (err) return cb(err);
    if (exists) return cb(null);
    db.query(`ALTER TABLE users ADD COLUMN \`${column}\` ${definition}`, cb);
  });
}

function ensureUsersLocationColumns(callback) {
  addUserColumnIfMissing("latitude", "DECIMAL(10,8) NULL", (e1) => {
    if (e1) return callback(e1);
    addUserColumnIfMissing("longitude", "DECIMAL(11,8) NULL", (e2) => {
      if (e2) return callback(e2);
      addUserColumnIfMissing("last_updated_location", "TIMESTAMP NULL DEFAULT NULL", (e3) => {
        if (e3) return callback(e3);
        callback(null);
      });
    });
  });
}

/** Add delivery_guy to role enum and normalize legacy `driver` rows. */
function migrateUsersRoleDeliveryGuy(callback) {
  db.query(
    "ALTER TABLE users MODIFY COLUMN role ENUM('customer','supplier','driver','delivery_guy','admin') NOT NULL DEFAULT 'customer'",
    (err) => {
      if (err && !String(err.message).includes("Duplicate") && !String(err.message).includes("check that column/key exists")) {
        console.warn("ALTER users.role enum:", err.message);
      }
      db.query("UPDATE users SET role = 'delivery_guy' WHERE role = 'driver'", (e2) => {
        if (e2) console.warn("role driver→delivery_guy:", e2.message);
        callback(null);
      });
    }
  );
}

function normalizeDeliveryGuyStatus(callback) {
  db.query(
    "UPDATE delivery_guy SET status = 'available' WHERE status IS NULL OR status = '' OR status = 'active'",
    (err) => {
      if (err) console.warn("normalize delivery_guy.status:", err.message);
      callback(null);
    }
  );
}

/** orders.driver_id must reference delivery_guy.id (not users.id). */
function migrateOrdersDriverIdToDeliveryGuyPk(callback) {
  db.query(
    `UPDATE orders o
     INNER JOIN delivery_guy dg ON dg.user_id = o.driver_id
     SET o.driver_id = dg.id
     WHERE o.driver_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM delivery_guy x WHERE x.id = o.driver_id)`,
    (e1) => {
      if (e1) console.warn("migrate driver_id (user→dg.pk):", e1.message);
      db.query(
        `UPDATE orders o
         INNER JOIN delivery_guy dg ON dg.user_id = o.delivery_id
         SET o.driver_id = dg.id
         WHERE o.driver_id IS NULL AND o.delivery_id IS NOT NULL`,
        (e2) => {
          if (e2) console.warn("migrate driver_id from delivery_id:", e2.message);
          callback(null);
        }
      );
    }
  );
}

function migrateOrderStatusesBolt(callback) {
  const stmts = [
    "UPDATE orders SET status = 'driver_assigned' WHERE status = 'assigned'",
    "UPDATE orders SET status = 'completed' WHERE status = 'delivered'",
    "UPDATE orders SET status = 'accepted' WHERE status = 'processing'",
    "UPDATE orders SET status = 'driver_assigned' WHERE status = 'paid' AND driver_id IS NOT NULL",
    "UPDATE orders SET status = 'accepted' WHERE status = 'paid' AND driver_id IS NULL",
  ];
  let i = 0;
  function step() {
    if (i >= stmts.length) return callback(null);
    const sql = stmts[i++];
    db.query(sql, (err) => {
      if (err) console.warn("order status migrate:", err.message);
      step();
    });
  }
  step();
}

function seedAdminIfEnabled(callback) {
  if (process.env.SEED_ADMIN !== "true") return callback(null);
  const bcrypt = require("bcryptjs");
  const email = process.env.ADMIN_EMAIL || "admin@gas.local";
  const pass = process.env.ADMIN_PASSWORD;
  const phone = process.env.ADMIN_PHONE || "+255000000000";
  if (!pass) {
    console.warn("SEED_ADMIN=true but ADMIN_PASSWORD is missing; admin seed skipped");
    return callback(null);
  }
  db.query("SELECT id FROM users WHERE email = ? OR phone = ?", [email, phone], (err, rows) => {
    if (err) return callback(err);
    const password_hash = bcrypt.hashSync(String(pass), 10);
    if (rows.length > 1) {
      return callback(new Error("ADMIN_EMAIL and ADMIN_PHONE belong to different accounts"));
    }
    if (rows.length === 1) {
      return db.query(
        "UPDATE users SET email = ?, phone = ?, password_hash = ?, role = 'admin' WHERE id = ?",
        [email, phone, password_hash, rows[0].id],
        callback
      );
    }
    db.query(
      `INSERT INTO users (email, phone, password_hash, role) VALUES (?, ?, ?, 'admin')`,
      [email, phone, password_hash],
      callback
    );
  });
}

/** Legacy DBs: allow INSERT INTO users (email, phone, password_hash, role) without profile columns */
function relaxUsersForMinimalAuthInsert(callback) {
  columnExists("users", "full_name", (err, hasFn) => {
    if (err || !hasFn) return callback(null);
    db.query("ALTER TABLE users MODIFY full_name VARCHAR(255) NULL DEFAULT NULL", (e1) => {
      if (e1) console.warn("ALTER users.full_name:", e1.message);
      callback(null);
    });
  });
}

function migrateSuppliersPricesToGasPrices(callback) {
  // First check if gas_prices table exists and suppliers.prices column exists
  tableExists("gas_prices", (err, hasGasPrices) => {
    if (err || !hasGasPrices) return callback(null);
    
    columnExists("suppliers", "prices", (e2, hasPricesColumn) => {
      if (e2 || !hasPricesColumn) return callback(null);
      
      // Migrate data from suppliers.prices to gas_prices table
      db.query(
        `SELECT user_id, prices FROM suppliers WHERE prices IS NOT NULL AND prices != ''`,
        (err, rows) => {
          if (err) {
            console.warn("Error reading suppliers.prices:", err.message);
            return callback(null);
          }
          
          let migrated = 0;
          rows.forEach(row => {
            try {
              const prices = JSON.parse(row.prices);
              if (typeof prices === 'object' && prices !== null) {
                // Convert nested price structure to flat gas_prices records
                Object.keys(prices).forEach(brand => {
                  const brandPrices = prices[brand];
                  if (typeof brandPrices === 'object' && brandPrices !== null) {
                    Object.keys(brandPrices).forEach(size => {
                      const price = brandPrices[size];
                      if (typeof price === 'number' && price > 0) {
                        db.query(
                          `INSERT IGNORE INTO gas_prices (supplier_id, brand, size, price) VALUES (?, ?, ?, ?)`,
                          [row.user_id, brand, size, price],
                          (e3) => {
                            if (e3) console.warn("Error migrating price:", e3.message);
                            else migrated++;
                          }
                        );
                      }
                    });
                  }
                });
              }
            } catch (e) {
              console.warn("Error parsing supplier prices for user", row.user_id, e.message);
            }
          });
          
          // Preserve the legacy column. Destructive cleanup must be a separately
          // reviewed migration after production data has been verified.
          setTimeout(() => {
            console.log(`Migrated ${migrated} price records to gas_prices table`);
            callback(null);
          }, 1000);
        }
      );
    });
  });
}

function dropColumnIfExists(table, column, callback) {
  columnExists(table, column, (err, exists) => {
    if (err || !exists) return callback(null);
    db.query(`ALTER TABLE ${table} DROP COLUMN ${column}`, callback);
  });
}

function ensureSchema(callback) {
  runStatements(0, (err) => {
    if (err) return callback(err);
    relaxUsersForMinimalAuthInsert((eRel) => {
      if (eRel) return callback(eRel);
    ensureOrdersExtendedColumns((e0) => {
      if (e0) return callback(e0);
        ensureMessagesOrderColumns((eMsg) => {
          if (eMsg) return callback(eMsg);
          ensureUsersLocationColumns((eLoc) => {
            if (eLoc) return callback(eLoc);
            migrateDriversTableToDeliveryGuy((eM) => {
              if (eM) return callback(eM);
              backfillProfilesFromLegacyUsers((eB) => {
                if (eB) return callback(eB);
                migrateUsersRoleDeliveryGuy((eR) => {
                  if (eR) return callback(eR);
                  normalizeDeliveryGuyStatus((eN) => {
                    if (eN) return callback(eN);
                    migrateOrdersDriverIdToDeliveryGuyPk((eD) => {
                      if (eD) return callback(eD);
                      migrateOrderStatusesBolt((eS) => {
                        if (eS) return callback(eS);
                        migrateSuppliersPricesToGasPrices((eP) => {
                          seedAdminIfEnabled(callback);
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
    });
    });
  });
}

module.exports = { ensureSchema };
