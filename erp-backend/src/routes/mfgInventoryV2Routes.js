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
router.get("/skus/next-code", auth, rbac(view), ctrl.getNextSkuCode);
router.post("/skus", auth, rbac(manage), ctrl.createSku);
router.put("/skus/:id", auth, rbac(manage), ctrl.updateSku);
router.delete("/skus/:id", auth, rbac(manage), ctrl.deleteSku);
router.post("/skus/bulk-import", auth, rbac(manage), ctrl.bulkImportSkus);
router.post("/skus/renumber", auth, rbac(manage), ctrl.renumberSkus);

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
router.get("/purchases/next-number", auth, rbac(view), purchaseCtrl.getNextInvoiceNumber);
router.get("/purchases/invoices", auth, rbac(view), purchaseCtrl.getPurchaseInvoices);
router.post("/purchases/invoices", auth, rbac(manage), purchaseCtrl.createPurchaseInvoice);
router.put("/purchases/invoices/:id", auth, rbac(manage), purchaseCtrl.editPurchaseInvoice);
router.delete("/purchases/invoices/:id", auth, rbac(manage), purchaseCtrl.deletePurchaseInvoice);
router.put("/purchases/invoices/:id/cancel", auth, rbac(manage), purchaseCtrl.cancelPurchaseInvoice);
router.post("/purchases/payments", auth, rbac(manage), purchaseCtrl.recordPurchasePayment);

const salesOrderCtrl = require("../controllers/mfgSalesOrderV2Controller");

// Sales Orders V2 Routes (Makoro Replicated Engine)
router.get("/sales-orders/next-number", auth, rbac(view), salesOrderCtrl.getNextSalesOrderNumber);
router.get("/sales-orders", auth, rbac(view), salesOrderCtrl.getSalesOrders);
router.get("/sales-orders/:id", auth, rbac(view), salesOrderCtrl.getSalesOrderById);
router.get("/sales-orders/:id/bom-requirements", auth, rbac(view), salesOrderCtrl.getSalesOrderBomRequirements);
router.post("/sales-orders", auth, rbac(manage), salesOrderCtrl.createSalesOrder);
router.put("/sales-orders/:id", auth, rbac(manage), salesOrderCtrl.updateSalesOrder);
router.patch("/sales-orders/:id/status", auth, rbac(manage), salesOrderCtrl.updateSalesOrderStatus);

// Metadata routes
router.get("/metadata", auth, ctrl.getMetadata);
router.post("/metadata", auth, ctrl.updateMetadata);

module.exports = router;
