const router = require("express").Router();
const { downloadPdf, listByUser, listBySupplier } = require("../controllers/receiptController");
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth);

router.get("/supplier/:supplierId", listBySupplier);
router.get("/user/:userId", listByUser);
router.get("/:id/pdf", downloadPdf);

module.exports = router;
