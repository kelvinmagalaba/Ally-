const db = require("../config/db");
const { broadcastOrderStatus } = require("../utils/socketHub");
const { buildOrderReceiptPdfBuffer, allocateUniqueReceiptCode } = require("../utils/orderReceiptPdf");
const { getUserWithProfile } = require("../utils/authProfile");

function pickUserPublic(row) {
  if (!row) return null;
  return { id: row.id, full_name: row.full_name, phone: row.phone, email: row.email, role: row.role };
}

function loadUsersForReceipt(customerId, supplierId, cb) {
  getUserWithProfile(customerId, (e1, cust) => {
    if (e1) return cb(e1);
    getUserWithProfile(supplierId, (e2, sup) => {
      if (e2) return cb(e2);
      cb(null, cust, sup);
    });
  });
}

/** @param {string|null} nextStatus - if null, only receipt columns are updated (legacy paid repair) */
function persistReceiptOnOrder(orderId, receiptCode, receiptJsonStr, pdfBase64, nextStatus, cb) {
  db.query(
    `UPDATE orders SET receipt_code = ?, receipt_json = ?, receipt_pdf_base64 = ?,
     payment_status = 'confirmed', payment_confirmed_at = NOW() WHERE id = ?`,
    [receiptCode, receiptJsonStr, pdfBase64, orderId],
    cb
  );
}

/**
 * @param {object} orderRow - current orders row
 * @param {{ nextStatus: string|null }} opts - nextStatus after confirm (Bolt: accepted or driver_assigned); null keeps status
 */
function generateAndAttachReceipt(orderRow, opts, cb) {
  const nextStatus = opts && opts.nextStatus !== undefined ? opts.nextStatus : "accepted";
  const customerId = orderRow.customer_id;
  const supplierId = orderRow.supplier_id;
  if (!supplierId) return cb(new Error("Order has no supplier"));

  allocateUniqueReceiptCode((e1, receiptCode) => {
    if (e1) return cb(e1);
    loadUsersForReceipt(customerId, supplierId, (e2, cust, sup) => {
      if (e2) return cb(e2);
      const statusForPdf = nextStatus || orderRow.status;
      const orderForPdf = { ...orderRow, status: statusForPdf };
      const receiptPayload = {
        receipt_code: receiptCode,
        order_id: orderRow.id,
        brand: orderRow.brand,
        size: orderRow.size,
        price: Number(orderRow.price),
        customer: pickUserPublic(cust),
        supplier: pickUserPublic(sup),
        receiver_name: cust?.full_name || cust?.email || "",
        seller_name: sup?.full_name || sup?.email || "",
        cylinder_type: orderRow.size,
        cylinder_company: orderRow.brand,
        payment_number: orderRow.transaction_phone || null,
        confirmed_at: new Date().toISOString(),
        payment_status: "confirmed_by_supplier",
      };
      receiptPayload.qr_payload = JSON.stringify({
        receipt_code: receiptPayload.receipt_code,
        order_id: receiptPayload.order_id,
      });
      const receiptJsonStr = JSON.stringify(receiptPayload);
      buildOrderReceiptPdfBuffer(orderForPdf, cust, sup, receiptCode)
        .then((buf) => {
          const b64 = buf.toString("base64");
          persistReceiptOnOrder(orderRow.id, receiptCode, receiptJsonStr, b64, nextStatus, (e3) => {
            if (e3) return cb(e3);
            cb(null, { receiptCode, receiptId: orderRow.id });
          });
        })
        .catch(cb);
    });
  });
}

/** Customer marks “I have paid” — not verified until supplier confirms */
function customerMarkPaid(req, res) {
  const { order_id, payment_method } = req.body;
  const user_id = req.auth.id;
  if (!order_id) {
    return res.status(400).json({ message: "order_id is required" });
  }

  db.query("SELECT * FROM orders WHERE id = ?", [order_id], (err, orders) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!orders[0]) return res.status(404).json({ message: "Order not found" });
    const order = orders[0];
    if (Number(order.customer_id) !== Number(user_id)) {
      return res.status(403).json({ message: "Not your order" });
    }
    if (order.payment_status === "submitted") {
      return res.status(400).json({ message: "Payment already awaiting seller confirmation" });
    }
    const allowed = [
      "accepted",
      "driver_assigned",
      "picked_up",
      "in_transit",
      "arrived",
    ];
    if (!allowed.includes(order.status)) {
      return res.status(400).json({ message: "Order is not in a state that allows payment submission" });
    }
    if (order.status === "pending" && !order.supplier_id) {
      return res.status(400).json({ message: "Order has no supplier yet" });
    }
    if (order.receipt_code) {
      return res.status(400).json({ message: "Payment already confirmed for this order" });
    }

    db.query(
      "UPDATE orders SET payment_status = 'submitted', payment_method = ?, payment_submitted_at = NOW() WHERE id = ?",
      [String(payment_method || "mobile_money").slice(0, 64), order_id],
      (e2) => {
      if (e2) return res.status(500).json({ message: e2.message });
      broadcastOrderStatus(order_id, {
        orderId: Number(order_id),
        status: order.status,
        paymentStatus: "submitted",
        paymentPending: true,
      });
      res.json({
        message: "Payment submitted — awaiting seller confirmation",
        orderStatus: order.status,
        payment_method: payment_method || "mobile_money",
        amount: Number(order.total_amount ?? order.price),
      });
      }
    );
  });
}

/** Legacy: same as initiate — no automatic verification */
exports.payOrder = customerMarkPaid;
exports.initiateCustomerPayment = customerMarkPaid;

exports.confirmPaymentBySeller = (req, res) => {
  const { order_id } = req.body;
  const supplier_id = req.auth.id;
  if (!order_id) {
    return res.status(400).json({ message: "order_id is required" });
  }

  db.query("SELECT * FROM orders WHERE id = ?", [order_id], (err, orows) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!orows[0]) return res.status(404).json({ message: "Order not found" });
    const order = orows[0];
    if (Number(order.supplier_id) !== Number(supplier_id)) {
      return res.status(403).json({ message: "Not your sale to confirm" });
    }

    if (order.receipt_code) {
      return res.json({
        message: "Payment already confirmed",
        receiptId: Number(order_id),
        receipt_code: order.receipt_code,
        orderStatus: order.status,
      });
    }

    if (order.payment_status !== "submitted") {
      return res.status(400).json({ message: "No pending payment to confirm" });
    }

    db.query("SELECT * FROM orders WHERE id = ?", [order_id], (e2, freshRows) => {
      if (e2 || !freshRows[0]) return res.status(500).json({ message: e2 ? e2.message : "Order missing" });
      const fresh = freshRows[0];
      const nextSt = String(fresh.status);
      generateAndAttachReceipt(fresh, { nextStatus: null }, (e3, result) => {
        if (e3) {
          console.error(e3);
          return res.status(500).json({ message: e3.message || "Receipt generation failed" });
        }
        broadcastOrderStatus(order_id, {
          orderId: Number(order_id),
          status: nextSt,
          paymentStatus: "confirmed",
          receipt_code: result.receiptCode,
        });
        res.json({
          message: "Payment confirmed and receipt generated",
          receiptId: result.receiptId,
          receipt_code: result.receiptCode,
          orderStatus: nextSt,
        });
      });
    });
  });
};

/** Repair: paid (legacy) or processing without receipt row data */
exports.generateReceiptAfterPayment = (req, res) => {
  const { order_id } = req.body;
  const supplier_id = req.auth.id;
  if (!order_id) {
    return res.status(400).json({ message: "order_id is required" });
  }
  db.query("SELECT * FROM orders WHERE id = ?", [order_id], (err, orows) => {
    if (err || !orows[0]) return res.status(404).json({ message: "Order not found" });
    const order = orows[0];
    if (Number(order.supplier_id) !== Number(supplier_id)) {
      return res.status(403).json({ message: "Not your sale" });
    }
    if (order.receipt_code) {
      return res.status(400).json({ message: "Receipt already exists" });
    }
    const ok = ["processing", "paid", "accepted", "driver_assigned", "processing_payment"];
    if (!ok.includes(order.status)) {
      return res.status(400).json({ message: "Order must be in a payable state to generate receipt" });
    }
    generateAndAttachReceipt(order, { nextStatus: null }, (e2, result) => {
      if (e2) return res.status(500).json({ message: e2.message || "Receipt failed" });
      res.json({
        message: "Receipt generated",
        receiptId: result.receiptId,
        receipt_code: result.receiptCode,
      });
    });
  });
};

exports.listByUser = (req, res) => {
  const userId = req.auth.role === "admin" ? req.params.userId : req.auth.id;
  db.query(
    `SELECT o.id AS order_id, o.id, o.price AS amount, o.status, o.brand, o.size, o.created_at,
            o.receipt_code, o.receipt_json, o.transaction_phone
     FROM orders o
     WHERE o.customer_id = ?
       AND (
         o.payment_status = 'submitted'
         OR o.receipt_code IS NOT NULL
         OR o.status IN ('accepted','searching_driver','driver_assigned','picked_up','in_transit','arrived','delivered')
       )
     ORDER BY o.created_at DESC`,
    [userId],
    (err, rows) => {
      if (err) return res.status(500).json({ message: err.message });
      const mapped = rows.map((o) => ({
        id: o.id,
        order_id: o.order_id,
        user_id: Number(userId),
        amount: Number(o.amount),
        payment_method: "mobile_money",
        status: o.status,
        created_at: o.created_at,
        receipt_id: o.receipt_code ? o.id : null,
        brand: o.brand,
        size: o.size,
        receipt_code: o.receipt_code,
        transaction_phone: o.transaction_phone,
      }));
      res.json(mapped);
    }
  );
};
