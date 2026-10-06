const express = require("express");
const router = express.Router();
const auth = require("../middlewares/authMiddleware");
const rbac = require("../middlewares/rbacMiddleware");
const invoiceController = require("../controllers/salesInvoiceController");

const INV_PERMS = [
  "MANAGE_ORDERS",
  "VIEW_ORDERS",
  "CREATE_ORDERS",
  "MANAGE_DELIVERY",
  "VIEW_DELIVERY",
  "MANAGE_INVENTORY",
  "VIEW_INVENTORY"
];

router.get("/next-number", auth, rbac(INV_PERMS), invoiceController.getNextNumber);
router.get("/", auth, rbac(INV_PERMS), invoiceController.getInvoices);
router.get("/:id", auth, rbac(INV_PERMS), invoiceController.getInvoiceById);
router.post("/", auth, rbac(INV_PERMS), invoiceController.createInvoice);
router.put("/:id", auth, rbac(INV_PERMS), invoiceController.updateInvoice);
router.delete("/:id", auth, rbac(INV_PERMS), invoiceController.deleteInvoice);

module.exports = router;
