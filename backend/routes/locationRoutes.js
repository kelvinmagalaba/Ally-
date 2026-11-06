const router = require("express").Router();
const { 
  saveLocation, 
  latestForOrder,
  updateUserLocation,
  getNearbyUsers,
  createReport,
  getAllReports
} = require("../controllers/locationController");
const {
  requireAuth,
  requireRole,
  requireSelfBody,
  requireOrderAccessParam,
  requireAssignedDriverOrderBody,
} = require("../middleware/auth");
const discoveryController = require("../controllers/discoveryController");

router.use(requireAuth);

// Legacy endpoint - still works for order-specific location tracking
router.post("/", requireSelfBody("user_id"), requireAssignedDriverOrderBody("order_id"), saveLocation);

// New GPS tracking endpoints
router.post("/update", requireSelfBody("user_id"), updateUserLocation);
router.get("/nearby/users", requireRole("admin"), getNearbyUsers);
router.get("/nearby/suppliers", discoveryController.listApprovedSellers);
router.get("/nearby/drivers", requireRole("supplier", "admin"), discoveryController.listNearbyDrivers);

// Reports endpoints
router.post("/report", requireSelfBody("user_id"), createReport);
router.get("/reports", requireRole("admin"), getAllReports);

// Legacy endpoint
router.get("/order/:orderId/latest", requireOrderAccessParam("orderId"), latestForOrder);

module.exports = router;
