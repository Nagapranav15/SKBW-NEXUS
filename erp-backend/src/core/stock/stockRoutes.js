/** /api/v3/stock: thin HTTP layer over stockService. Company always comes from the authenticated user. */
const express = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");
const { id, qty, money, text, created, handler } = require("../http");
const auth = require("../../middlewares/authMiddleware");
const rbac = require("../../middlewares/rbacMiddleware");
const stock = require("./stockService");
const { Reel } = require("./models");

const router = express.Router();
const READ = ["VIEW_INVENTORY", "MANAGE_INVENTORY"];
const WRITE = "MANAGE_INVENTORY";

const receiptBody = z.object({
  companyId: id.optional(), itemId: id, locationId: id.nullish(), qty,
  unitCost: money.optional(), totalValue: money.optional(),
  txnType: z.enum(["OPENING", "RECEIPT", "RETURN_IN"]).optional(),
  referenceType: text.optional(), referenceId: text.optional(), remarks: text.optional(),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
}).strict().refine((b) => b.unitCost !== undefined || b.totalValue !== undefined, { message: "unitCost or totalValue is required" });

const issueBody = z.object({
  companyId: id.optional(), itemId: id, locationId: id.nullish(), qty,
  txnType: z.enum(["ISSUE", "SALE_OUT", "RETURN_OUT"]).optional(),
  referenceType: text.optional(), referenceId: text.optional(), remarks: text.optional(),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
}).strict();

const adjustBody = z.object({
  companyId: id.optional(), itemId: id, locationId: id.nullish(), qty,
  direction: z.enum(["IN", "OUT"]), reason: text.min(3),
  unitCost: money.optional(), remarks: text.optional(),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
}).strict();

const transferBody = z.object({
  companyId: id.optional(), itemId: id, fromLocationId: id, toLocationId: id, qty,
  referenceType: text.optional(), referenceId: text.optional(), remarks: text.optional(),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
}).strict();

const reelBody = z.object({
  companyId: id.optional(), itemId: id, locationId: id.nullish(), supplierId: id.nullish(), purchaseRef: text.optional(),
  ratePerKg: money.optional(), totalCost: money.optional(),
  reels: z.array(z.object({
    reelNumber: z.string().trim().min(1).max(60), weightKg: qty,
    gsm: z.number().positive().optional(), widthCm: z.number().positive().optional(),
  }).strict()).min(1).max(200),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
}).strict().refine((b) => b.ratePerKg !== undefined || b.totalCost !== undefined, { message: "ratePerKg or totalCost is required" });

router.post("/receipts", auth, rbac(WRITE), handler(async ({ req, companyId, actor }) => created(await stock.receive({ ...receiptBody.parse(req.body), companyId, ...actor }))));
router.post("/issues", auth, rbac(WRITE), handler(async ({ req, companyId, actor }) => created(await stock.issue({ ...issueBody.parse(req.body), companyId, ...actor }))));
router.post("/adjustments", auth, rbac(WRITE), handler(async ({ req, companyId, actor }) => created(await stock.adjust({ ...adjustBody.parse(req.body), companyId, ...actor }))));
router.post("/transfers", auth, rbac(WRITE), handler(async ({ req, companyId, actor }) => created(await stock.transfer({ ...transferBody.parse(req.body), companyId, ...actor }))));
router.post("/reels/receive", auth, rbac(WRITE), handler(async ({ req, companyId, actor }) => created(await stock.receiveReels({ ...reelBody.parse(req.body), companyId, ...actor }))));

router.get("/valuation", auth, rbac(READ), handler(({ companyId }) => stock.getValuation(companyId)));
router.get("/balances", auth, rbac(READ), handler(({ req, companyId }) => stock.getBalances(companyId, { itemId: req.query.itemId ? id.parse(req.query.itemId) : undefined })));
router.get("/ledger", auth, rbac(READ), handler(({ req, companyId }) => stock.getLedger(companyId, {
  itemId: req.query.itemId ? id.parse(req.query.itemId) : undefined,
  txnType: req.query.txnType, from: req.query.from, to: req.query.to,
  referenceType: req.query.referenceType, referenceId: req.query.referenceId,
  page: req.query.page, limit: req.query.limit,
})));
router.get("/items/:itemId/cost", auth, rbac(READ), handler(({ req, companyId }) => stock.getItemCost(companyId, id.parse(req.params.itemId))));
router.get("/items/:itemId/reconcile", auth, rbac(READ), handler(({ req, companyId }) => stock.reconcile(companyId, id.parse(req.params.itemId))));
router.get("/reels", auth, rbac(READ), handler(async ({ req, companyId }) => {
  const filter = { companyId: new mongoose.Types.ObjectId(companyId) };
  if (req.query.itemId) filter.itemId = new mongoose.Types.ObjectId(id.parse(req.query.itemId));
  if (req.query.status) filter.status = z.enum(["Available", "Consumed"]).parse(req.query.status);
  return Reel.find(filter).sort({ createdAt: -1 }).limit(500).lean();
}));

module.exports = router;
