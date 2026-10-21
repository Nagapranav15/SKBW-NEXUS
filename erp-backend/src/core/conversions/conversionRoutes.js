/** /api/v3/conversions: sheeting (cutting slip) and the other factory conversions. */
const express = require("express");
const { z } = require("zod");
const auth = require("../../middlewares/authMiddleware");
const rbac = require("../../middlewares/rbacMiddleware");
const svc = require("./conversionService");
const { CONVERSION_TYPES } = require("./models");
const { id, qty, money, text, idemKey, created, handler } = require("../http");

const router = express.Router();
const READ = ["VIEW_INVENTORY", "MANAGE_INVENTORY"];
const WRITE = "MANAGE_INVENTORY";
const optId = id.nullish();

const charge = z.object({ kind: z.enum(["PROCESSING", "JOB_WORK", "OTHER"]), description: text.optional(), vendorId: optId, amount: money }).strict();

const sheetingBody = z.object({
  companyId: id.optional(),
  date: z.coerce.date().optional(),
  reelItemId: id, targetItemId: id, sourceLocationId: optId, destinationLocationId: optId,
  reels: z.array(z.object({ reelId: id, weightKg: qty }).strict()).min(1).max(100),
  sheet: z.object({ widthCm: qty, lengthCm: qty, gsm: qty, sheetsPerReam: z.number().positive().optional() }).strict(),
  machine: z.object({
    reelsOnStand: z.number().positive().optional(), slitsCount: z.number().positive().optional(),
    cuts: z.number().min(0).optional(), startMeter: z.number().optional(), endMeter: z.number().optional(),
  }).strict().optional(),
  actualSheets: z.number().min(0).optional(),
  scrap: z.object({ weightKg: money.optional(), ratePerKg: money.optional(), coreCount: money.optional(), coreRatePerPc: money.optional() }).strict().optional(),
  additionalCosts: z.array(charge).max(50).optional(),
  machineName: text.optional(), operatorName: text.optional(), notes: text.optional(), reference: text.optional(),
  idempotencyKey: idemKey.optional(),
}).strict();

const outputReel = z.object({ reelNumber: z.string().trim().min(1).max(60), weightKg: qty, gsm: z.number().positive().optional(), widthCm: z.number().positive().optional() }).strict();
const genericBody = z.object({
  companyId: id.optional(),
  type: z.enum(CONVERSION_TYPES).refine((t) => t !== "SHEETING", "Use /sheeting for sheeting"),
  date: z.coerce.date().optional(),
  inputs: z.array(z.object({ itemId: id, locationId: optId, qty, reels: z.array(z.object({ reelId: id, weightKg: qty }).strict()).optional() }).strict()).min(1).max(50),
  outputs: z.array(z.object({ itemId: id, locationId: optId, qty, costShare: z.number().positive().optional(), reels: z.array(outputReel).optional() }).strict()).min(1).max(50),
  charges: z.array(charge).max(50).optional(),
  wastageQty: z.number().min(0).optional(), wastageNote: text.optional(), scrapCredit: money.optional(),
  reference: text.optional(), operatorName: text.optional(), notes: text.optional(),
  idempotencyKey: idemKey.optional(),
}).strict();

router.post("/sheeting", auth, rbac(WRITE), handler(async ({ req, companyId, actor }) => created(await svc.postSheeting({ ...sheetingBody.parse(req.body), companyId, ...actor }))));
router.post("/sheeting/preview", auth, rbac(READ), handler(async ({ req, companyId }) => svc.previewSheeting({ ...sheetingBody.parse(req.body), companyId })));
router.post("/", auth, rbac(WRITE), handler(async ({ req, companyId, actor }) => created(await svc.postConversion({ ...genericBody.parse(req.body), companyId, ...actor }))));
router.get("/", auth, rbac(READ), handler(({ req, companyId }) => svc.listConversions(companyId, {
  type: req.query.type ? z.enum(CONVERSION_TYPES).parse(req.query.type) : undefined, page: req.query.page, limit: req.query.limit,
})));
router.get("/:id", auth, rbac(READ), handler(({ req, companyId }) => svc.getConversion(companyId, id.parse(req.params.id))));

module.exports = router;
