const router = require("express").Router();
const {
  payOrder,
  listByUser,
  initiateCustomerPayment,
  confirmPaymentBySeller,
  generateReceiptAfterPayment,
} = require("../controllers/transactionController");
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth);

router.post("/pay", payOrder);
router.post("/initiate-payment", initiateCustomerPayment);
router.post("/confirm-payment-by-seller", confirmPaymentBySeller);
router.post("/generate-receipt-after-payment", generateReceiptAfterPayment);
router.get("/user/:userId", listByUser);

module.exports = router;
