const express = require("express");
const router = express.Router();
const auth = require("../middlewares/authMiddleware");
const rbac = require("../middlewares/rbacMiddleware");
const ctrl = require("../controllers/warehouseController");

router.get("/", auth, rbac(["MANAGE_ITEMS", "VIEW_ITEMS"]), ctrl.getWarehouses);
router.get("/:id", auth, rbac(["MANAGE_ITEMS", "VIEW_ITEMS"]), ctrl.getWarehouseById);
router.post("/", auth, rbac("MANAGE_ITEMS"), ctrl.createWarehouse);
router.put("/:id", auth, rbac("MANAGE_ITEMS"), ctrl.updateWarehouse);
router.delete("/:id", auth, rbac("MANAGE_ITEMS"), ctrl.deleteWarehouse);

module.exports = router;
