const express = require("express");
const router = express.Router();
const auth = require("../middlewares/authMiddleware");
const rbac = require("../middlewares/rbacMiddleware");
const dcController = require("../controllers/deliveryChallanController");

const DC_PERMS = ["MANAGE_DELIVERY", "CREATE_ORDERS", "MANAGE_ORDERS", "MANAGE_DISPATCH", "VIEW_DELIVERY", "VIEW_ORDERS"];

router.get("/", auth, rbac(DC_PERMS), dcController.getDeliveryChallans);
router.get("/next-number", auth, rbac(DC_PERMS), dcController.getNextNumber);
router.get("/:id", auth, rbac(DC_PERMS), dcController.getDeliveryChallanById);
router.post("/", auth, rbac(DC_PERMS), dcController.createDeliveryChallan);
router.put("/:id", auth, rbac(DC_PERMS), dcController.updateDeliveryChallan);
router.delete("/:id", auth, rbac(DC_PERMS), dcController.deleteDeliveryChallan);

module.exports = router;
