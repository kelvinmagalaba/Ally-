const express = require("express");
const router = express.Router();
const pricingController = require("../controllers/pricingController");
const { requireAuth, requireRole, requireSelfParam, requireSelfBody } = require("../middleware/auth");

router.use(requireAuth);

// Get all prices for a supplier
router.get("/supplier/:supplierId", pricingController.getSupplierPrices);

// Update or insert prices for a supplier
router.put("/supplier/:supplierId", requireRole("supplier", "admin"), requireSelfParam("supplierId"), pricingController.updateSupplierPrices);

// Get specific price for brand/size
router.get("/supplier/:supplierId/:brand/:size", pricingController.getSupplierPrice);

// Delete specific price
router.delete("/supplier/:supplierId/:brand/:size", requireRole("supplier", "admin"), requireSelfParam("supplierId"), pricingController.deleteSupplierPrice);

// Save gas prices (bulk insert/update)
router.post("/save", requireRole("supplier", "admin"), requireSelfBody("supplierId"), pricingController.saveGasPrices);

module.exports = router;
