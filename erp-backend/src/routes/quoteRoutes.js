const express = require("express");
const router = express.Router();
const auth = require("../middlewares/authMiddleware");
const rbac = require("../middlewares/rbacMiddleware");
const quoteController = require("../controllers/quoteController");

router.get("/", auth, rbac(["MANAGE_QUOTES", "VIEW_QUOTES", "CREATE_QUOTES"]), quoteController.getQuotes);
router.get("/:id", auth, rbac(["MANAGE_QUOTES", "VIEW_QUOTES", "CREATE_QUOTES"]), quoteController.getQuoteById);
router.post("/", auth, rbac(["MANAGE_QUOTES", "CREATE_QUOTES"]), quoteController.createQuote);
router.put("/:id", auth, rbac(["MANAGE_QUOTES", "CREATE_QUOTES"]), quoteController.updateQuote);
router.patch("/:id/status", auth, rbac("MANAGE_QUOTES"), quoteController.updateQuoteStatus);
router.delete("/:id", auth, rbac("MANAGE_QUOTES"), quoteController.deleteQuote);

module.exports = router;
