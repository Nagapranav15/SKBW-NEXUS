const express = require("express");
const router = express.Router();
const auth = require("../middlewares/authMiddleware");
const rbac = require("../middlewares/rbacMiddleware");
const itemController = require("../controllers/itemController");

router.get("/", auth, rbac(["MANAGE_ITEMS", "VIEW_ITEMS"]), itemController.getItems);
router.get("/:id", auth, rbac(["MANAGE_ITEMS", "VIEW_ITEMS"]), itemController.getItemById);
router.post("/", auth, rbac("MANAGE_ITEMS"), itemController.createItem);
router.put("/:id", auth, rbac("MANAGE_ITEMS"), itemController.updateItem);
router.delete("/:id", auth, rbac("MANAGE_ITEMS"), itemController.deleteItem);

module.exports = router;
