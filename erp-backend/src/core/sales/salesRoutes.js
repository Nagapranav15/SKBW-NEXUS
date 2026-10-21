/** /api/v3/sales: receivables, payments, statements, credit checks, ageing. */
const express = require("express");
const { z } = require("zod");
const auth = require("../../middlewares/authMiddleware");
const rbac = require("../../middlewares/rbacMiddleware");
const svc = require("./salesService");
const { id, money, text, idemKey, created, handler } = require("../http");

const router = express.Router();
const WRITE = ["MANAGE_PARTIES", "CREATE_PARTIES", "MANAGE_ORDERS"];
const READ = ["VIEW_ORDERS", "MANAGE_ORDERS", "VIEW_PARTIES", "MANAGE_PARTIES", "VIEW_REPORTS"];
const amount = z.number().positive().finite();

const paymentBody = z.object({
  companyId: id.optional(), partyId: id, amount, mode: z.enum(["CASH", "UPI", "BANK", "CHEQUE", "CARD"]),
  date: z.coerce.date().optional(), reference: text.optional(), notes: text.optional(),
  allocations: z.array(z.object({ receivableId: id, amount }).strict()).max(100).optional(),
  idempotencyKey: idemKey.optional(),
}).strict();
const reverseBody = z.object({ companyId: id.optional(), reason: z.string().trim().min(3).max(300) }).strict();
const openingBody = z.object({ companyId: id.optional(), amount, date: z.coerce.date().optional() }).strict();
const cancelBody = z.object({ companyId: id.optional(), reason: text.optional() }).strict();

router.post("/invoices/:invoiceId/post", auth, rbac(WRITE), handler(async ({ req, companyId, actor }) => created(await svc.postInvoice({ companyId, invoiceId: req.params.invoiceId, userId: actor.userId }))));
router.post("/invoices/:invoiceId/cancel", auth, rbac(WRITE), handler(async ({ req, companyId, actor }) => svc.cancelInvoice({ companyId, invoiceId: req.params.invoiceId, reason: cancelBody.parse(req.body || {}).reason, userId: actor.userId })));

router.post("/payments", auth, rbac(WRITE), handler(async ({ req, companyId, actor }) => created(await svc.recordPayment({ ...paymentBody.parse(req.body), companyId, userId: actor.userId }))));
router.post("/payments/:paymentId/reverse", auth, rbac(WRITE), handler(async ({ req, companyId, actor }) => svc.reversePayment({ companyId, paymentId: id.parse(req.params.paymentId), reason: reverseBody.parse(req.body).reason, userId: actor.userId })));
router.get("/payments", auth, rbac(READ), handler(({ req, companyId }) => svc.listPayments(companyId, { partyId: req.query.partyId ? id.parse(req.query.partyId) : undefined, limit: req.query.limit })));
router.get("/payments/:paymentId", auth, rbac(READ), handler(({ req, companyId }) => svc.getPayment(companyId, id.parse(req.params.paymentId))));

router.post("/parties/:partyId/opening-balance", auth, rbac("MANAGE_PARTIES"), handler(async ({ req, companyId, actor }) => created(await svc.setOpeningBalance({ ...openingBody.parse(req.body), companyId, partyId: id.parse(req.params.partyId), userId: actor.userId }))));
router.get("/parties/:partyId/balance", auth, rbac(READ), handler(({ req, companyId }) => svc.getBalance(companyId, id.parse(req.params.partyId))));
router.get("/parties/:partyId/statement", auth, rbac(READ), handler(({ req, companyId }) => svc.getStatement(companyId, id.parse(req.params.partyId), { from: req.query.from, to: req.query.to })));
router.get("/parties/:partyId/credit", auth, rbac(READ), handler(({ req, companyId }) => svc.getCreditStatus(companyId, id.parse(req.params.partyId), req.query.amount ? Number(z.coerce.number().min(0).parse(req.query.amount)) : 0)));
router.get("/parties/:partyId/reconcile", auth, rbac(READ), handler(({ req, companyId }) => svc.reconcile(companyId, id.parse(req.params.partyId))));

router.get("/receivables", auth, rbac(READ), handler(({ req, companyId }) => svc.listReceivables(companyId, { partyId: req.query.partyId ? id.parse(req.query.partyId) : undefined, status: req.query.status ? z.enum(["Open", "Partial", "Paid", "Cancelled"]).parse(req.query.status) : undefined })));
router.get("/receivables/ageing", auth, rbac(READ), handler(({ req, companyId }) => svc.getAgeing(companyId, { asOf: req.query.asOf })));

module.exports = router;
