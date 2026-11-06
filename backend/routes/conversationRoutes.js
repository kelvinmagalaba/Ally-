const router = require("express").Router();
const { listConversationsForUser } = require("../controllers/messageController");
const { requireAuth, requireSelfParam } = require("../middleware/auth");

router.get("/:userId", requireAuth, requireSelfParam("userId"), listConversationsForUser);

module.exports = router;
