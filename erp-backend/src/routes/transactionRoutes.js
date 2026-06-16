const express = require("express");
const router = express.Router();
const auth = require("../middlewares/authMiddleware");
const rbac = require("../middlewares/rbacMiddleware");
const ctrl = require("../controllers/transactionController");

// Analytics & exports (must come before /:id)
router.get("/analytics", auth, rbac(["MANAGE_REPORTS", "VIEW_REPORTS", "VIEW_TRANSACTIONS"]), ctrl.getAnalytics);
router.get("/export/daily", auth, rbac(["MANAGE_REPORTS", "VIEW_REPORTS", "VIEW_TRANSACTIONS"]), ctrl.exportDailyTransactions);
router.get("/export/ledger", auth, rbac(["MANAGE_REPORTS", "VIEW_REPORTS"]), ctrl.exportLedger);

// Import
router.post("/import/preview", auth, rbac(["MANAGE_REPORTS", "MANAGE_DATA"]), ctrl.previewImport);
router.post("/import", auth, rbac(["MANAGE_REPORTS", "MANAGE_DATA"]), ctrl.importTransactions);

// CRUD
router.get("/", auth, rbac(["MANAGE_REPORTS", "VIEW_REPORTS", "MANAGE_ORDERS", "VIEW_ORDERS", "VIEW_TRANSACTIONS"]), ctrl.getTransactions);
router.get("/:id", auth, rbac(["MANAGE_REPORTS", "VIEW_REPORTS", "VIEW_TRANSACTIONS"]), ctrl.getTransactionById);
router.post("/", auth, rbac(["MANAGE_REPORTS", "MANAGE_DATA"]), ctrl.createTransaction);
router.put("/:id", auth, rbac(["MANAGE_REPORTS", "MANAGE_DATA"]), ctrl.updateTransaction);
router.delete("/:id", auth, rbac(["MANAGE_REPORTS", "MANAGE_DATA"]), ctrl.deleteTransaction);

module.exports = router;
