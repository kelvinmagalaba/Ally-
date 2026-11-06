/**
 * Real receipt PDF generator using PDFKit + qrcode.
 *
 * Replaces the previous mock. Returns a Buffer (or rejects).
 *
 * The QR encodes a JSON payload with:
 *   - order_id
 *   - receipt_code
 *   - verify_code  (delivery_verification_code, the secret the driver enters at the customer's door)
 *
 * The driver app can either scan this QR or type the verify_code manually.
 */

const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const db = require("../config/db");

function allocateUniqueReceiptCode(callback) {
  // Receipt code that can be displayed to customers/sellers.
  // Format: RCP-<timestamp>-<rand>
  const code =
    "RCP-" +
    Date.now().toString(36).toUpperCase() +
    "-" +
    Math.random().toString(36).slice(2, 7).toUpperCase();
  callback(null, code);
}

function fmtMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  return "TSH " + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtSize(s) {
  if (s == null) return "";
  const str = String(s);
  return /kg/i.test(str) ? str : `${str} kg`;
}

/**
 * Build a Buffer PDF of the receipt.
 *
 * Two call signatures supported (the codebase calls it both ways):
 *   - buildOrderReceiptPdfBuffer(orderRow, customer, supplier, receiptCode) -> Promise<Buffer>
 *   - buildOrderReceiptPdfBuffer(orderId, callback)       -> callback(err, Buffer)
 */
function buildOrderReceiptPdfBuffer(...args) {
  // Callback-style fallback: (orderId, cb)
  if (args.length === 2 && typeof args[1] === "function") {
    const [orderId, cb] = args;
    return db.query(
      `SELECT o.*, c.full_name AS customer_name, cu.email AS customer_email, cu.phone AS customer_phone,
              s.full_name AS supplier_name, su.email AS supplier_email, su.phone AS supplier_phone
         FROM orders o
         LEFT JOIN users cu ON cu.id = o.customer_id
         LEFT JOIN customers c ON c.user_id = o.customer_id
         LEFT JOIN users su ON su.id = o.supplier_id
         LEFT JOIN suppliers s ON s.user_id = o.supplier_id
        WHERE o.id = ? LIMIT 1`,
      [orderId],
      (err, rows) => {
        if (err) return cb(err);
        if (!rows[0]) return cb(new Error("Order not found"));
        const row = rows[0];
        const cust = {
          full_name: row.customer_name,
          email: row.customer_email,
          phone: row.customer_phone,
        };
        const sup = {
          full_name: row.supplier_name,
          email: row.supplier_email,
          phone: row.supplier_phone,
        };
        renderPdf(row, cust, sup, row.receipt_code || "")
          .then((buf) => cb(null, buf))
          .catch(cb);
      }
    );
  }

  const [orderRow, customer, supplier, receiptCode] = args;
  return renderPdf(orderRow, customer || {}, supplier || {}, receiptCode || "");
}

async function renderPdf(orderRow, customer, supplier, receiptCode) {
  // Build the JSON payload that the QR code will carry.
  // We try to reuse existing receipt_json if present (so the verify_code we generated is preserved).
  let payload = null;
  if (orderRow.receipt_json) {
    try {
      const parsed = JSON.parse(orderRow.receipt_json);
      if (parsed && typeof parsed === "object") payload = parsed;
    } catch (_) {
      payload = null;
    }
  }
  if (!payload) {
    payload = {
      order_id: orderRow.id,
      receipt_code: receiptCode,
      verify_code:
        Math.random().toString(36).slice(2, 10).toUpperCase(),
    };
  }
  const qrPayloadStr = payload.qr_payload
    ? payload.qr_payload
    : JSON.stringify({
        receipt_code: receiptCode || payload.receipt_code,
        order_id: orderRow.id,
        verify_code: payload.delivery_verification_code || payload.verify_code,
      });

  const verifyCode =
    payload.delivery_verification_code || payload.verify_code || "";

  // Render QR to PNG buffer.
  const qrPng = await QRCode.toBuffer(qrPayloadStr, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
  });

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A5", margin: 32 });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // ===== Header =====
      doc
        .fontSize(20)
        .fillColor("#1d4ed8")
        .text("Gas Cylinder Receipt", { align: "center" });
      doc
        .moveDown(0.3)
        .fontSize(10)
        .fillColor("#475569")
        .text(`Receipt code: ${receiptCode || payload.receipt_code || "-"}`, {
          align: "center",
        });

      doc
        .moveTo(32, doc.y + 6)
        .lineTo(doc.page.width - 32, doc.y + 6)
        .strokeColor("#cbd5e1")
        .lineWidth(0.8)
        .stroke();
      doc.moveDown(1);

      // ===== Parties =====
      doc.fontSize(11).fillColor("#0f172a");
      doc.font("Helvetica-Bold").text("Customer:", { continued: true });
      doc
        .font("Helvetica")
        .text(`  ${customer.full_name || customer.email || "-"}`);
      if (customer.phone)
        doc.font("Helvetica").text(`Phone: ${customer.phone}`);

      if (orderRow.is_for_friend) {
        doc.moveDown(0.3);
        doc
          .font("Helvetica-Bold")
          .fillColor("#92400e")
          .text("Delivered for a friend:");
        doc.font("Helvetica").fillColor("#0f172a");
        if (orderRow.recipient_name)
          doc.text(`Recipient: ${orderRow.recipient_name}`);
        if (orderRow.recipient_phone)
          doc.text(`Recipient phone: ${orderRow.recipient_phone}`);
        if (orderRow.delivery_address)
          doc.text(`Drop-off: ${orderRow.delivery_address}`);
      }

      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").text("Seller:", { continued: true });
      doc
        .font("Helvetica")
        .text(`  ${supplier.full_name || supplier.email || "-"}`);
      if (supplier.phone)
        doc.font("Helvetica").text(`Phone: ${supplier.phone}`);

      doc.moveDown(0.8);

      // ===== Order summary box =====
      const boxTop = doc.y;
      doc
        .roundedRect(32, boxTop, doc.page.width - 64, 90, 8)
        .fillAndStroke("#f1f5f9", "#cbd5e1");

      doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(11);
      doc.text("Order Summary", 44, boxTop + 10);
      doc.font("Helvetica").fontSize(10);
      doc.text(`Order #${orderRow.id}`, 44, boxTop + 28);
      doc.text(
        `Item: ${orderRow.brand || "-"} · ${fmtSize(orderRow.size)}`,
        44,
        boxTop + 44
      );
      doc.text(
        `Payment phone: ${orderRow.transaction_phone || customer.phone || "-"}`,
        44,
        boxTop + 60
      );
      doc
        .font("Helvetica-Bold")
        .fillColor("#15803d")
        .fontSize(13)
        .text(fmtMoney(orderRow.price), 44, boxTop + 74);

      doc.y = boxTop + 100;
      doc.moveDown(0.5);

      // ===== QR code & verify code =====
      doc
        .fillColor("#0f172a")
        .font("Helvetica-Bold")
        .fontSize(11)
        .text("Scan at delivery", { align: "left" });
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#475569")
        .text(
          "The driver scans this QR — or types the code below — to confirm the cylinder was handed over.",
          { align: "left" }
        );
      doc.moveDown(0.4);

      const qrSize = 130;
      const qrX = (doc.page.width - qrSize) / 2;
      const qrY = doc.y;
      doc.image(qrPng, qrX, qrY, { width: qrSize, height: qrSize });
      doc.y = qrY + qrSize + 10;

      doc
        .font("Helvetica-Bold")
        .fontSize(16)
        .fillColor("#1d4ed8")
        .text(verifyCode, { align: "center", characterSpacing: 4 });

      doc
        .moveDown(0.3)
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#64748b")
        .text(
          "Keep this receipt safe. The cylinder is released only when this code matches.",
          { align: "center" }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  allocateUniqueReceiptCode,
  buildOrderReceiptPdfBuffer,
};
