const router = require("express").Router();
const { sendMessage, getMessagesByOrder } = require("../controllers/messageController");
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth);

router.post("/send", sendMessage);
router.get("/order/:orderId", getMessagesByOrder);

module.exports = router;
