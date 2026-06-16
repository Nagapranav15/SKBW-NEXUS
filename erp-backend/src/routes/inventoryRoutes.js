const express = require("express");
const router = express.Router();
const auth = require("../middlewares/authMiddleware");
const rbac = require("../middlewares/rbacMiddleware");
const ctrl = require("../controllers/inventoryController");

const viewPerms = ["MANAGE_INVENTORY", "VIEW_INVENTORY", "MANAGE_ITEMS", "VIEW_ITEMS"];
const managePerms = ["MANAGE_INVENTORY", "MANAGE_ITEMS"];

// ─── View routes ───
router.get("/summary", auth, rbac(viewPerms), ctrl.getInventorySummary);
router.get("/warehouse/:warehouseId", auth, rbac(viewPerms), ctrl.getInventoryByWarehouse);
router.get("/item/:itemId", auth, rbac(viewPerms), ctrl.getInventoryByItem);

// Stock movement audit trail
router.get("/stock-movements/all", auth, rbac(viewPerms), ctrl.getAllStockMovements);
router.get("/stock-movements/:itemId", auth, rbac(viewPerms), ctrl.getStockMovements);

// ─── New ledger endpoints ───
router.get("/balances", auth, rbac(viewPerms), ctrl.getInventoryBalances);
router.get("/dashboard-summary", auth, rbac(viewPerms), ctrl.getDashboardSummary);
router.get("/low-stock", auth, rbac(viewPerms), ctrl.getLowStock);
router.get("/audit-logs", auth, rbac(viewPerms), ctrl.getAuditLogs);
router.get("/export", auth, rbac(viewPerms), ctrl.exportInventory);
router.get("/min-stock-levels", auth, rbac(viewPerms), ctrl.getMinimumStockLevels);

// ─── Modify routes ───
router.post("/", auth, rbac(managePerms), ctrl.addStock);
router.put("/:id", auth, rbac(managePerms), ctrl.updateStock);
router.delete("/:id", auth, rbac(managePerms), ctrl.removeStock);
router.post("/:id/transfer", auth, rbac(managePerms), ctrl.transferStock);

// ─── New modify endpoints ───
router.post("/opening-stock", auth, rbac(managePerms), ctrl.recordOpeningStock);
router.post("/bulk-adjustment", auth, rbac(managePerms), ctrl.bulkAdjustment);
router.post("/min-stock-level", auth, rbac(managePerms), ctrl.setMinimumStockLevel);
router.post("/import", auth, rbac(managePerms), ctrl.importInventory);

module.exports = router;
