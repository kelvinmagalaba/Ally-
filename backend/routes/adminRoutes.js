const router = require("express").Router();
const { stats, listUsers, setApproval } = require("../controllers/adminController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("admin"));
router.get("/stats", stats);
router.get("/users", listUsers);
router.patch("/users/:userId/approval", setApproval);

module.exports = router;
