const express = require("express");
const router = express.Router();
const auth = require("../middlewares/authMiddleware");
const rbac = require("../middlewares/rbacMiddleware");
const productionOrderController = require("../controllers/productionOrderController");

const permissions = ["MANAGE_INVENTORY", "VIEW_INVENTORY", "MANAGE_ITEMS", "VIEW_ITEMS", "MANAGE_ORDERS", "VIEW_ORDERS"];

router.get("/", auth, rbac(permissions), productionOrderController.getProductionOrders);
router.get("/next-number", auth, rbac(permissions), productionOrderController.getNextOrderNumber);
router.get("/:id", auth, rbac(permissions), productionOrderController.getProductionOrderById);
router.post("/", auth, rbac(permissions), productionOrderController.createProductionOrder);
router.put("/:id", auth, rbac(permissions), productionOrderController.updateProductionOrder);
router.post("/:id/entries", auth, rbac(permissions), productionOrderController.recordProductionEntry);
router.patch("/:id/complete", auth, rbac(permissions), productionOrderController.completeProductionOrder);
router.delete("/:id", auth, rbac(permissions), productionOrderController.deleteProductionOrder);

module.exports = router;
