const db = require("../config/db");
const { getTimestampField, mapTimestampFields } = require("../utils/timestampFields");

exports.downloadPdf = (req, res) => {
  const id = req.params.id;
  db.query(
    `SELECT receipt_pdf_base64, receipt_code FROM orders
     WHERE id = ? AND receipt_pdf_base64 IS NOT NULL AND receipt_pdf_base64 != ''
       AND (? = 'admin' OR customer_id = ? OR supplier_id = ?
         OR driver_id IN (SELECT id FROM delivery_guy WHERE user_id = ?))`,
    [id, req.auth.role, req.auth.id, req.auth.id, req.auth.id],
    (err, rows) => {
      if (err) return res.status(500).json({ message: err.message });
      if (!rows[0]) return res.status(404).json({ message: "Receipt not found" });
      const buf = Buffer.from(rows[0].receipt_pdf_base64, "base64");
      const name = rows[0].receipt_code ? String(rows[0].receipt_code).replace(/[^\w-]+/g, "_") : id;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="receipt-${name}.pdf"`);
      res.send(buf);
    }
  );
};

exports.listByUser = (req, res) => {
  const userId = req.auth.role === "admin" ? req.params.userId : req.auth.id;
  
  // Get timestamp field names for orders table
  getTimestampField('orders', 'updated')
    .then(updatedField => {
      // Build safe SELECT clause with existing timestamp fields
      const selectFields = [
        'o.id', 'o.id AS order_id', '0 AS transaction_id',
        'o.price AS amount', "'mobile_money' AS payment_method", 'o.receipt_code'
      ];
      
      let orderByClause = 'o.id DESC';
      if (updatedField) {
        selectFields.push(`o.${updatedField} AS created_at`);
        orderByClause = `o.${updatedField} DESC, o.id DESC`;
      }
      
      const query = `
        SELECT ${selectFields.join(', ')}
        FROM orders o
        WHERE o.customer_id = ? AND o.receipt_code IS NOT NULL
        ORDER BY ${orderByClause}
      `;

      return db.query(query, [userId]);
    })
    .then(([rows]) => {
      // Map timestamp fields to standard names
      const mappedRows = rows.map(row => mapTimestampFields('orders', row));
      res.json(mappedRows);
    })
    .catch((err) => {
      console.error("Error listing receipts by user:", err);
      res.status(500).json({ message: "Database error: " + err.message });
    });
};

exports.listBySupplier = (req, res) => {
  const supplierId = req.auth.role === "admin" ? req.params.supplierId : req.auth.id;
  
  // Get timestamp field names for orders table
  getTimestampField('orders', 'updated')
    .then(updatedField => {
      // Build safe SELECT clause with existing timestamp fields
      const selectFields = [
        'o.id', 'o.id AS order_id', 'o.price AS amount',
        'o.receipt_code', 'o.customer_id AS payer_id'
      ];
      
      let orderByClause = 'o.id DESC';
      if (updatedField) {
        selectFields.push(`o.${updatedField} AS created_at`);
        orderByClause = `o.${updatedField} DESC, o.id DESC`;
      }
      
      const query = `
        SELECT ${selectFields.join(', ')}
        FROM orders o
        WHERE o.supplier_id = ? AND o.receipt_code IS NOT NULL
        ORDER BY ${orderByClause}
      `;

      return db.query(query, [supplierId]);
    })
    .then(([rows]) => {
      // Map timestamp fields to standard names
      const mappedRows = rows.map(row => mapTimestampFields('orders', row));
      res.json(mappedRows);
    })
    .catch((err) => {
      console.error("Error listing receipts by supplier:", err);
      res.status(500).json({ message: "Database error: " + err.message });
    });
};
