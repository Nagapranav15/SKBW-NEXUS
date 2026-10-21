/** /api/v3/reports: management reports. Read-only. */
const express = require("express");
const { z } = require("zod");
const auth = require("../../middlewares/authMiddleware");
const rbac = require("../../middlewares/rbacMiddleware");
const svc = require("./reportService");
const { handler } = require("../http");

const router = express.Router();
const READ = ["VIEW_REPORTS", "MANAGE_REPORTS"];
const period = z.object({ from: z.string().max(30).optional(), to: z.string().max(30).optional() });

router.get("/overview", auth, rbac(READ), handler(({ req, companyId }) => svc.overview(companyId, period.parse(req.query))));
router.get("/sales", auth, rbac(READ), handler(({ req, companyId }) => svc.salesReport(companyId, { ...period.parse(req.query), groupBy: z.enum(["month", "customer"]).default("month").parse(req.query.groupBy) })));
router.get("/stock-movements", auth, rbac(READ), handler(({ req, companyId }) => svc.stockMovements(companyId, period.parse(req.query))));
router.get("/production", auth, rbac(READ), handler(({ req, companyId }) => svc.productionReport(companyId, period.parse(req.query))));
router.get("/pipeline", auth, rbac(READ), handler(({ req, companyId }) => svc.pipeline(companyId, { limit: req.query.limit })));

module.exports = router;
