const router = require("express").Router();
const { requireAuth } = require("../middleware/auth");
const {
  createOrder,
  getOrders,
  getOrderById,
  acceptOrder,
  cancelOrder,
  setOrderTransactionPhone,
} = require("../controllers/orderController");

router.use(requireAuth);
router.post("/", createOrder);
router.get("/", getOrders);
router.get("/:id", getOrderById);
router.post("/:id/accept", acceptOrder);
router.patch("/:id/transaction-phone", setOrderTransactionPhone);
router.post("/:id/cancel", cancelOrder);

module.exports = router;
