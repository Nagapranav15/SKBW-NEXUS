const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const auth = require("../middlewares/authMiddleware");
const rbac = require("../middlewares/rbacMiddleware");

// Account creation is not public: only an authenticated user manager can create users
router.post("/register", auth, rbac("MANAGE_USERS"), authController.register);
router.post("/login", authController.login);
router.get("/me", auth, authController.getMe);

module.exports = router;