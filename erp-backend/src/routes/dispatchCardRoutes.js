const express = require("express");
const router = express.Router();
const auth = require("../middlewares/authMiddleware");
const rbac = require("../middlewares/rbacMiddleware");
const dispatchController = require("../controllers/dispatchCardController");

router.get("/", auth, rbac("MANAGE_DISPATCH"), dispatchController.getDispatchCards);
router.get("/:id", auth, rbac("MANAGE_DISPATCH"), dispatchController.getDispatchCardById);
router.post("/", auth, rbac("MANAGE_DISPATCH"), dispatchController.createDispatchCard);
router.put("/:id", auth, rbac("MANAGE_DISPATCH"), dispatchController.updateDispatchCard);
router.delete("/:id", auth, rbac("MANAGE_DISPATCH"), dispatchController.deleteDispatchCard);

module.exports = router;
