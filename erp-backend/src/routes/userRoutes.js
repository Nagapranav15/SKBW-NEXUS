const express = require("express");
const router = express.Router();
const auth = require("../middlewares/authMiddleware");
const rbac = require("../middlewares/rbacMiddleware");
const userController = require("../controllers/userController");

router.get("/", auth, rbac("MANAGE_USERS"), userController.getUsers);
router.get("/:id", auth, rbac("MANAGE_USERS"), userController.getUserById);
router.post("/", auth, rbac("MANAGE_USERS"), userController.createUser);
router.put("/:id", auth, rbac("MANAGE_USERS"), userController.updateUser);
router.delete("/:id", auth, rbac("MANAGE_USERS"), userController.deleteUser);

module.exports = router;