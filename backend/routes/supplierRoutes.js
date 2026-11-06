const express = require("express");
const router = express.Router();
const supplierController = require("../controllers/supplierController");
const { requireAuth, requireRole, requireSelfParam, requireSelfBody } = require("../middleware/auth");

router.use(requireAuth);

// Check supplier onboarding status
router.get("/status/:userId", requireSelfParam("userId"), supplierController.checkSupplierStatus);

// Save selected brands
router.post("/brands/:userId", requireRole("supplier", "admin"), requireSelfParam("userId"), supplierController.saveSelectedBrands);

// Get selected brands
router.get("/brands/:supplierId", supplierController.getSelectedBrands);

// Get supplier prices grouped by brand
router.get("/prices/:supplierId", supplierController.getSupplierPricesGrouped);

// List all suppliers for customers
router.get("/list", supplierController.listSuppliers);

// Set supplier prices (bulk)
router.post("/set-prices", (req, res, next) => {
  console.log('SUPPLIER ROUTES: POST /set-prices called');
  console.log('SUPPLIER ROUTES: Request body:', req.body);
  console.log('SUPPLIER ROUTES: Headers:', req.headers);
  next();
}, requireRole("supplier", "admin"), requireSelfBody("supplierId"), supplierController.setSupplierPrices);

// Get seller dashboard statistics
router.get("/stats/:supplierId", requireRole("supplier", "admin"), requireSelfParam("supplierId"), supplierController.getSellerStats);

// Get supplier with pricing
router.get("/:supplierId", supplierController.getSupplierWithPricing);

module.exports = router;
