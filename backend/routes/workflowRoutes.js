const router = require("express").Router();
const workflow = require("../controllers/workflowController");
const { requireAuth, requireRole } = require("../middleware/auth");
const { createRateLimiter } = require("../middleware/rateLimit");

const deliveryCodeLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
  key: (req) => `${req.auth?.id}:${req.params.id}`,
});

router.use(requireAuth);
router.post("/quotes", workflow.createQuote);
router.get("/notifications", workflow.listNotifications);
router.patch("/notifications/read-all", workflow.markAllNotificationsRead);
router.patch("/notifications/:id/read", workflow.markNotificationRead);
router.get("/driver/availability", requireRole("delivery_guy", "driver"), workflow.getDriverAvailability);
router.put("/driver/availability", requireRole("delivery_guy", "driver"), workflow.setDriverAvailability);
router.put("/seller/location", requireRole("supplier"), workflow.updateSellerLocation);
router.get("/driver-offers", requireRole("delivery_guy", "driver"), workflow.listDriverOffers);
router.post("/orders/:id/reject", requireRole("supplier", "admin"), workflow.rejectOrder);
router.post("/orders/:id/offer-driver", requireRole("supplier"), workflow.offerDriver);
router.post("/orders/:id/offer-nearest-driver", requireRole("supplier"), workflow.offerNearestDriver);
router.post("/driver-offers/:offerId/respond", requireRole("delivery_guy", "driver"), workflow.respondToOffer);
router.post("/orders/:id/delivery-state", requireRole("delivery_guy", "driver"), workflow.updateDeliveryState);
router.post("/orders/:id/delivery-code", deliveryCodeLimiter, workflow.getDeliveryCode);
router.post("/orders/:id/verify-delivery", requireRole("delivery_guy", "driver"), deliveryCodeLimiter, workflow.verifyDeliveryCode);
router.get("/pricing-rule", requireRole("admin"), workflow.getPricingRule);
router.put("/pricing-rule", requireRole("admin"), workflow.updatePricingRule);

module.exports = router;
