const express = require("express");
const router = express.Router();
const auth = require("../middlewares/authMiddleware");
const rbac = require("../middlewares/rbacMiddleware");
const dashboardController = require("../controllers/dashboardController");

router.get("/stats", auth, rbac("VIEW_DASHBOARD"), dashboardController.getDashboardStats);
router.get("/reports", auth, rbac(["MANAGE_REPORTS", "VIEW_REPORTS"]), dashboardController.getSalesReport);

module.exports = router;
