const express = require("express");
const router = express.Router();
const auth = require("../middlewares/authMiddleware");
const rbac = require("../middlewares/rbacMiddleware");
const ctrl = require("../controllers/mfgInventoryController");

const view = ["MANAGE_INVENTORY", "VIEW_INVENTORY", "MANAGE_ITEMS", "VIEW_ITEMS"];
const manage = ["MANAGE_INVENTORY", "MANAGE_ITEMS"];

// Factories
router.get("/factories", auth, rbac(view), ctrl.getFactories);
router.post("/factories", auth, rbac(manage), ctrl.createFactory);
router.put("/factories/:id", auth, rbac(manage), ctrl.updateFactory);
router.delete("/factories/:id", auth, rbac(manage), ctrl.deleteFactory);

// Floors
router.get("/floors", auth, rbac(view), ctrl.getFloors);
router.post("/floors", auth, rbac(manage), ctrl.createFloor);
router.put("/floors/:id", auth, rbac(manage), ctrl.updateFloor);
router.delete("/floors/:id", auth, rbac(manage), ctrl.deleteFloor);

// Zones
router.get("/zones", auth, rbac(view), ctrl.getZones);
router.post("/zones", auth, rbac(manage), ctrl.createZone);
router.put("/zones/:id", auth, rbac(manage), ctrl.updateZone);
router.delete("/zones/:id", auth, rbac(manage), ctrl.deleteZone);

// SKUs
router.get("/skus", auth, rbac(view), ctrl.getSkus);
router.post("/skus", auth, rbac(manage), ctrl.createSku);
router.put("/skus/:id", auth, rbac(manage), ctrl.updateSku);
router.delete("/skus/:id", auth, rbac(manage), ctrl.deleteSku);

// Movements
router.get("/movements", auth, rbac(view), ctrl.getMovements);
router.post("/movements", auth, rbac(manage), ctrl.recordMovement);

// Stock (computed)
router.get("/stock", auth, rbac(view), ctrl.getInventoryStock);
router.get("/zones-stock", auth, rbac(view), ctrl.getZonesWithStock);
router.get("/zones/:zoneId/stock", auth, rbac(view), ctrl.getZoneStock);
router.get("/zones/:zoneId/movements", auth, rbac(view), ctrl.getZoneMovements);
router.put("/zones/:zoneId/locations/rename", auth, rbac(manage), ctrl.renameLocation);
router.post("/zones/:zoneId/locations/transfer", auth, rbac(manage), ctrl.transferLocationInZone);
router.delete("/zones/:zoneId/locations", auth, rbac(manage), ctrl.deleteLocationInZone);
router.get("/dashboard-stats", auth, rbac(view), ctrl.getInventoryDashboardStats);
router.get("/analytics", auth, rbac(view), ctrl.getAnalytics);

// BOM
router.get("/boms", auth, rbac(view), ctrl.getBoms);
router.post("/boms", auth, rbac(manage), ctrl.createBom);
router.put("/boms/:id", auth, rbac(manage), ctrl.updateBom);
router.delete("/boms/:id", auth, rbac(manage), ctrl.deleteBom);
router.post("/boms/execute", auth, rbac(manage), ctrl.executeBom);

module.exports = router;
