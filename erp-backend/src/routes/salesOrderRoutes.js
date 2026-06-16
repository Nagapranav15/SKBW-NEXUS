const express = require("express");
const router = express.Router();
const auth = require("../middlewares/authMiddleware");
const rbac = require("../middlewares/rbacMiddleware");
const salesOrderController = require("../controllers/salesOrderController");

router.get("/", auth, rbac(["MANAGE_ORDERS", "VIEW_ORDERS", "CREATE_ORDERS"]), salesOrderController.getSalesOrders);
router.get("/pending", auth, rbac(["MANAGE_ORDERS", "VIEW_ORDERS", "CREATE_ORDERS"]), salesOrderController.getPendingOrders);
router.get("/:id", auth, rbac(["MANAGE_ORDERS", "VIEW_ORDERS", "CREATE_ORDERS"]), salesOrderController.getSalesOrderById);
router.post("/", auth, rbac(["MANAGE_ORDERS", "CREATE_ORDERS"]), salesOrderController.createSalesOrder);
router.put("/:id", auth, rbac("MANAGE_ORDERS"), salesOrderController.updateSalesOrder);
router.patch("/:id/status", auth, rbac("MANAGE_ORDERS"), salesOrderController.updateSalesOrderStatus);
router.delete("/:id", auth, rbac("MANAGE_ORDERS"), salesOrderController.deleteSalesOrder);

module.exports = router;
