/** /api/v3/recipes */
const express = require("express");
const { z } = require("zod");
const auth = require("../../middlewares/authMiddleware");
const rbac = require("../../middlewares/rbacMiddleware");
const svc = require("./recipeService");
const { MATERIAL_BASES, PROCESS_BASES, PROCESS_KINDS } = require("./recipeEngine");
const { id, money, text, created, handler } = require("../http");

const router = express.Router();
const READ = ["VIEW_INVENTORY", "MANAGE_INVENTORY"];
const WRITE = "MANAGE_INVENTORY";

const spec = z.object({
  sizeLabel: text.optional(), pages: z.number().positive(), pagesPerLeaf: z.number().positive(), ups: z.number().positive(),
  gsm: z.number().positive().optional(), ruling: text.optional(), hasIndex: z.boolean().optional(),
  coverType: text.optional(), binding: text.optional(), piecesPerBundle: z.number().positive(),
}).strict();
const material = z.object({
  key: z.string().trim().min(1).max(40), role: z.enum(["PAPER", "INDEX", "COVER", "BINDING_MATERIAL", "PACKING", "OTHER"]),
  itemId: id, basis: z.enum(MATERIAL_BASES), qty: z.number().positive().optional(), wastagePct: z.number().min(0).max(100).optional(),
}).strict();
const proc = z.object({
  key: z.string().trim().min(1).max(40), kind: z.enum(PROCESS_KINDS), basis: z.enum(PROCESS_BASES),
  rate: money, wastagePct: z.number().min(0).max(100).optional(), vendorId: id.nullish(),
}).strict();

const createBody = z.object({
  companyId: id.optional(), name: z.string().trim().min(2).max(120), productItemId: id.nullish(),
  spec, materials: z.array(material).min(1).max(50), processes: z.array(proc).max(30).optional(), active: z.boolean().optional(),
}).strict();
const updateBody = createBody.partial().strict();
const calcBody = z.object({ companyId: id.optional(), books: z.number().positive().optional(), bundles: z.number().positive().optional() })
  .strict().refine((b) => (b.books === undefined) !== (b.bundles === undefined), { message: "Provide exactly one of books or bundles" });

router.post("/", auth, rbac(WRITE), handler(async ({ req, companyId, actor }) => created(await svc.createRecipe({ ...createBody.parse(req.body), companyId, ...actor }))));
router.put("/:id", auth, rbac(WRITE), handler(async ({ req, companyId, actor }) => svc.updateRecipe(companyId, id.parse(req.params.id), { ...updateBody.parse(req.body), ...actor })));
router.get("/", auth, rbac(READ), handler(({ req, companyId }) => svc.listRecipes(companyId, { activeOnly: req.query.active === "true" })));
router.get("/:id", auth, rbac(READ), handler(({ req, companyId }) => svc.getRecipe(companyId, id.parse(req.params.id))));
router.post("/:id/calculate", auth, rbac(READ), handler(({ req, companyId }) => svc.calculate(companyId, id.parse(req.params.id), calcBody.parse(req.body))));

module.exports = router;
