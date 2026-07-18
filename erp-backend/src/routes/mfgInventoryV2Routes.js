const express = require("express");
const router = express.Router();
const auth = require("../middlewares/authMiddleware");
const rbac = require("../middlewares/rbacMiddleware");
const ctrl = require("../controllers/mfgInventoryV2Controller");
const purchaseCtrl = require("../controllers/mfgPurchaseV2Controller");

const view = ["MANAGE_INVENTORY", "VIEW_INVENTORY", "MANAGE_ITEMS", "VIEW_ITEMS"];
const manage = ["MANAGE_INVENTORY", "MANAGE_ITEMS"];

// SKU Routes
router.get("/skus", auth, rbac(view), ctrl.getSkus);
router.post("/skus", auth, rbac(manage), ctrl.createSku);
router.put("/skus/:id", auth, rbac(manage), ctrl.updateSku);
router.delete("/skus/:id", auth, rbac(manage), ctrl.deleteSku);
router.post("/skus/bulk-import", auth, rbac(manage), ctrl.bulkImportSkus);

// Warehouse routes
router.get("/warehouse/hierarchy", auth, rbac(view), ctrl.getWarehouseHierarchy);
router.get("/warehouse/locations/:id", auth, rbac(view), ctrl.getLocationDetails);
router.post("/warehouse/locations", auth, rbac(manage), ctrl.createWarehouseLocation);
router.put("/warehouse/locations/:id", auth, rbac(manage), ctrl.updateWarehouseLocation);
router.delete("/warehouse/locations/:id", auth, rbac(manage), ctrl.deleteWarehouseLocation);

// Inventory Ledger Engine Routes
router.get("/inventory-ledger", auth, rbac(view), ctrl.getInventoryLedger);
router.get("/inventory-ledger/:id", auth, rbac(view), ctrl.getInventoryLedgerById);
router.post("/inventory-ledger", auth, rbac(manage), ctrl.createInventoryLedgerEntry);
router.put("/inventory-ledger/:id", (req, res) => res.status(405).json({ msg: "Ledger entries are immutable. Editing is prohibited." }));
router.delete("/inventory-ledger/:id", (req, res) => res.status(405).json({ msg: "Ledger entries are immutable. Deleting is prohibited." }));

// Ledger routes
router.get("/ledger", auth, rbac(view), ctrl.getLedger);
router.post("/ledger/transfer", auth, rbac(manage), ctrl.recordTransfer);

// Stock balance route
router.get("/balances", auth, rbac(view), ctrl.getBalances);

// Dashboard routes
router.get("/dashboard", auth, rbac(view), ctrl.getDashboardStats);

// Purchase V2 routes
router.get("/purchases/invoices", auth, rbac(view), purchaseCtrl.getPurchaseInvoices);
router.post("/purchases/invoices", auth, rbac(manage), purchaseCtrl.createPurchaseInvoice);
router.put("/purchases/invoices/:id", auth, rbac(manage), purchaseCtrl.editPurchaseInvoice);
router.delete("/purchases/invoices/:id", auth, rbac(manage), purchaseCtrl.deletePurchaseInvoice);
router.post("/purchases/payments", auth, rbac(manage), purchaseCtrl.recordPurchasePayment);

module.exports = router;
