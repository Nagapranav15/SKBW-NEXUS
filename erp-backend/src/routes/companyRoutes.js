const express = require("express");
const router = express.Router();
const auth = require("../middlewares/authMiddleware");
const rbac = require("../middlewares/rbacMiddleware");
const companyController = require("../controllers/companyController");

router.get("/", auth, rbac(["MANAGE_COMPANIES", "VIEW_COMPANIES"]), companyController.getCompanies);
router.get("/:id", auth, rbac(["MANAGE_COMPANIES", "VIEW_COMPANIES"]), companyController.getCompanyById);
router.post("/", auth, rbac("MANAGE_COMPANIES"), companyController.createCompany);
router.put("/:id", auth, rbac("MANAGE_COMPANIES"), companyController.updateCompany);
router.delete("/:id", auth, rbac("MANAGE_COMPANIES"), companyController.deleteCompany);

module.exports = router;
