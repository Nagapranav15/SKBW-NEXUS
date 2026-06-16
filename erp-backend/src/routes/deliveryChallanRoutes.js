const express = require("express");
const router = express.Router();
const auth = require("../middlewares/authMiddleware");
const rbac = require("../middlewares/rbacMiddleware");
const dcController = require("../controllers/deliveryChallanController");

router.get("/", auth, rbac(["MANAGE_DELIVERY", "VIEW_DELIVERY"]), dcController.getDeliveryChallans);
router.get("/:id", auth, rbac(["MANAGE_DELIVERY", "VIEW_DELIVERY"]), dcController.getDeliveryChallanById);
router.post("/", auth, rbac("MANAGE_DELIVERY"), dcController.createDeliveryChallan);
router.put("/:id", auth, rbac("MANAGE_DELIVERY"), dcController.updateDeliveryChallan);
router.delete("/:id", auth, rbac("MANAGE_DELIVERY"), dcController.deleteDeliveryChallan);

module.exports = router;
