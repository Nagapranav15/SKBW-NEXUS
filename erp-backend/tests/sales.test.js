/**
 * Receivables on a transactional in-memory MongoDB: invoices, payments and allocation, advances, reversals,
 * opening balances, credit rules, ageing, concurrency, the legacy invoice hook and company isolation.
 */
process.env.JWT_SECRET = "test-secret-".padEnd(48, "x");
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

const scope = require("../src/core/companyScope");
scope.registerPlugin();
const app = require("../src/app");
const Role = require("../src/models/roleModel");
const Permission = require("../src/models/permissionModel");
const User = require("../src/models/userModel");
const Company = require("../src/models/companyModel");
const Party = require("../src/models/partyModel");
const SalesInvoice = require("../src/models/salesInvoiceModel");
const sales = require("../src/core/sales/salesService");
const { PartyLedger, Receivable, Payment } = require("../src/core/sales/models");
const { generateToken } = require("../src/utils/jwt");

const asAdmin = (fn) => scope.runWithScope({ superAdmin: true }, fn);
const run = asAdmin;
let repl, A, B, tokens, seq = 0;

const mkParty = (company, over = {}) => Party.create({ type: "customer", firmName: `Customer ${++seq}`, company: company._id, creditDays: 30, ...over });
const day = (iso) => new Date(`${iso}T00:00:00.000Z`);
const mkInvoice = (company, party, total, invoiceDate, over = {}) =>
  SalesInvoice.create({ invoiceNumber: `INV-${++seq}`, invoiceDate, customerId: party._id, customerName: party.firmName, grandTotal: total, company: company._id, status: "created", paymentTerms: "30 Days", dueDate: "", ...over });
const post = async (company, party, total, date) => (await run(async () => { const i = await mkInvoice(company, party, total, date); return sales.postInvoice({ companyId: company._id, invoiceId: String(i._id) }); })).receivable;
const pay = (company, party, amount, extra = {}) => run(() => sales.recordPayment({ companyId: company._id, partyId: party._id, amount, mode: "CASH", ...extra }));
const bal = (company, party) => run(() => sales.getBalance(company._id, party._id)).then((b) => b.balance);
const recon = (company, party) => run(() => sales.reconcile(company._id, party._id));
const recOf = (id) => asAdmin(() => Receivable.findById(id).lean());

test.before(async () => {
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(repl.getUri());
  await asAdmin(async () => {
    A = await Company.create({ name: "A", address: "a", phone: "1", email: "a@a.com", gst: "A" });
    B = await Company.create({ name: "B", address: "b", phone: "2", email: "b@b.com", gst: "B" });
    const perms = await Permission.insertMany(["MANAGE_ORDERS", "VIEW_ORDERS", "MANAGE_PARTIES", "VIEW_PARTIES"].map((name) => ({ name })));
    const manager = await Role.create({ name: "manager", permissions: perms.map((p) => p._id) });
    const mk = (username, companies) => User.create({ username, fullName: username, email: `${username}@t.com`, password: "x", role: manager._id, companies });
    tokens = { alice: generateToken(await mk("alice", [A._id])), bob: generateToken(await mk("bob", [B._id])) };
  });
});
test.after(async () => { await mongoose.disconnect(); await repl.stop(); });

test("an invoice becomes a receivable and a DR ledger entry; posting twice changes nothing", async () => {
  const p = await asAdmin(() => mkParty(A));
  const inv = await asAdmin(() => mkInvoice(A, p, 10000, "2026-10-01"));
  const first = await run(() => sales.postInvoice({ companyId: A._id, invoiceId: String(inv._id) }));
  const again = await run(() => sales.postInvoice({ companyId: A._id, invoiceId: String(inv._id) }));
  assert.equal(first.duplicate, false);
  assert.equal(again.duplicate, true);
  assert.equal(await bal(A, p), 10000);
  assert.equal(await asAdmin(() => PartyLedger.countDocuments({ companyId: A._id, partyId: p._id })), 1);
  assert.equal(first.receivable.total, 10000);
  assert.equal(first.receivable.dueDate.toISOString().slice(0, 10), "2026-10-31"); // invoice date + 30 credit days
  assert.equal((await recon(A, p)).ok, true);
});

test("payments settle the oldest due invoice first and part-payment leaves the rest outstanding", async () => {
  const p = await asAdmin(() => mkParty(A));
  const r1 = await post(A, p, 10000, "2026-08-01"); // due 31 Aug
  const r2 = await post(A, p, 5000, "2026-09-01"); // due 1 Oct
  const res = await pay(A, p, 12000);
  assert.deepEqual(res.payment.allocations.map((a) => [a.invoiceNumber, a.amount]), [[r1.invoiceNumber, 10000], [r2.invoiceNumber, 2000]]);
  assert.equal(res.payment.unallocated, 0);
  assert.equal((await recOf(r1._id)).status, "Paid");
  const second = await recOf(r2._id);
  assert.deepEqual([second.status, second.paid], ["Partial", 2000]);
  assert.equal(await bal(A, p), 3000); // 15,000 invoiced - 12,000 received
  assert.equal((await recon(A, p)).ok, true);
});

test("a payment can be allocated explicitly to a chosen invoice", async () => {
  const p = await asAdmin(() => mkParty(A));
  const r1 = await post(A, p, 4000, "2026-08-01");
  const r2 = await post(A, p, 6000, "2026-09-01");
  await pay(A, p, 1500, { allocations: [{ receivableId: String(r2._id), amount: 1500 }] });
  assert.equal((await recOf(r1._id)).paid, 0);
  assert.equal((await recOf(r2._id)).paid, 1500);
  await assert.rejects(pay(A, p, 100, { allocations: [{ receivableId: String(r1._id), amount: 5000 }] }), (e) => e.code === "OVER_ALLOCATED");
  assert.equal(await bal(A, p), 8500);
});

test("overpayment becomes an advance and is applied automatically to the next invoice", async () => {
  const p = await asAdmin(() => mkParty(A));
  await post(A, p, 3000, "2026-10-01");
  const res = await pay(A, p, 5000);
  assert.equal(res.payment.unallocated, 2000);
  assert.equal(await bal(A, p), -2000); // customer is in credit by 2,000
  assert.equal((await recon(A, p)).ok, true);
  const next = await post(A, p, 2500, "2026-10-10");
  assert.equal(next.paid, 2000); // the advance was applied
  assert.equal(next.status, "Partial");
  assert.equal(await bal(A, p), 500);
  assert.equal((await asAdmin(() => Payment.findOne({ _id: res.payment._id }).lean())).unallocated, 0);
  assert.equal((await recon(A, p)).ok, true);
});

test("an opening balance is the oldest open item and payments settle it", async () => {
  const p = await asAdmin(() => mkParty(A));
  await run(() => sales.setOpeningBalance({ companyId: A._id, partyId: p._id, amount: 7000, date: "2026-04-01" }));
  await assert.rejects(run(() => sales.setOpeningBalance({ companyId: A._id, partyId: p._id, amount: 1, date: "2026-04-01" })), (e) => e.code === "OPENING_EXISTS");
  await post(A, p, 2000, "2026-10-01");
  const res = await pay(A, p, 7000);
  assert.deepEqual(res.payment.allocations.map((a) => [a.invoiceNumber, a.amount]), [["Opening Balance", 7000]]);
  assert.equal(await bal(A, p), 2000);
  assert.equal((await recon(A, p)).ok, true);
});

test("reversing a payment makes the invoices outstanding again, with a correcting entry", async () => {
  const p = await asAdmin(() => mkParty(A));
  const r = await post(A, p, 6000, "2026-10-01");
  const res = await pay(A, p, 6000);
  assert.equal((await recOf(r._id)).status, "Paid");
  await assert.rejects(run(() => sales.reversePayment({ companyId: A._id, paymentId: String(res.payment._id), reason: "" })), (e) => e.code === "REASON_REQUIRED");
  await run(() => sales.reversePayment({ companyId: A._id, paymentId: String(res.payment._id), reason: "Cheque bounced" }));
  const back = await recOf(r._id);
  assert.deepEqual([back.status, back.paid], ["Open", 0]);
  assert.equal(await bal(A, p), 6000);
  const entries = await asAdmin(() => PartyLedger.find({ companyId: A._id, partyId: p._id }).sort({ createdAt: 1 }).lean());
  assert.deepEqual(entries.map((e) => `${e.txnType}:${e.direction}`), ["INVOICE:DR", "PAYMENT:CR", "REVERSAL:DR"]);
  const twice = await run(() => sales.reversePayment({ companyId: A._id, paymentId: String(res.payment._id), reason: "again" }));
  assert.equal(twice.duplicate, true);
  assert.equal(await bal(A, p), 6000);
  assert.equal((await recon(A, p)).ok, true);
});

test("cancelling an invoice reverses it, but not while payments are allocated to it", async () => {
  const p = await asAdmin(() => mkParty(A));
  const inv = await asAdmin(() => mkInvoice(A, p, 4000, "2026-10-01"));
  await run(() => sales.postInvoice({ companyId: A._id, invoiceId: String(inv._id) }));
  const pr = await pay(A, p, 1000);
  await assert.rejects(run(() => sales.cancelInvoice({ companyId: A._id, invoiceId: String(inv._id) })), (e) => e.code === "INVOICE_HAS_PAYMENTS");
  await run(() => sales.reversePayment({ companyId: A._id, paymentId: String(pr.payment._id), reason: "Wrong party" }));
  await run(() => sales.cancelInvoice({ companyId: A._id, invoiceId: String(inv._id), reason: "Issued in error" }));
  assert.equal(await bal(A, p), 0);
  assert.equal((await asAdmin(() => Receivable.findOne({ companyId: A._id, invoiceId: String(inv._id) }).lean())).status, "Cancelled");
  assert.equal((await run(() => sales.cancelInvoice({ companyId: A._id, invoiceId: String(inv._id) }))).duplicate, true);
  assert.equal((await recon(A, p)).ok, true);
});

test("changing a posted invoice's total posts an adjustment, never below what is already paid", async () => {
  const p = await asAdmin(() => mkParty(A));
  const inv = await asAdmin(() => mkInvoice(A, p, 5000, "2026-10-01"));
  await run(() => sales.postInvoice({ companyId: A._id, invoiceId: String(inv._id) }));
  await asAdmin(() => SalesInvoice.updateOne({ _id: inv._id }, { $set: { grandTotal: 5500 } }));
  assert.equal((await run(() => sales.adjustInvoiceTotal({ companyId: A._id, invoiceId: String(inv._id) }))).difference, 500);
  assert.equal(await bal(A, p), 5500);
  await pay(A, p, 5000);
  await asAdmin(() => SalesInvoice.updateOne({ _id: inv._id }, { $set: { grandTotal: 4000 } }));
  await assert.rejects(run(() => sales.adjustInvoiceTotal({ companyId: A._id, invoiceId: String(inv._id) })), (e) => e.code === "INVOICE_HAS_PAYMENTS");
  assert.equal((await recon(A, p)).ok, true);
});

test("statement shows opening, movements and closing balance for a date range", async () => {
  const p = await asAdmin(() => mkParty(A));
  await post(A, p, 1000, "2026-01-10");
  await post(A, p, 2000, "2026-02-10");
  await pay(A, p, 500, { date: "2026-02-20" });
  await post(A, p, 4000, "2026-03-10");
  const all = await run(() => sales.getStatement(A._id, p._id));
  assert.equal(all.closingBalance, 6500);
  const feb = await run(() => sales.getStatement(A._id, p._id, { from: "2026-02-01", to: "2026-02-28" }));
  assert.equal(feb.openingBalance, 1000);
  assert.equal(feb.rows.length, 2);
  assert.equal(feb.totalDebit, 2000);
  assert.equal(feb.totalCredit, 500);
  assert.equal(feb.closingBalance, 2500);
});

test("credit rules: limit, cash-only customers, no limit set, overdue flag", async () => {
  const limited = await asAdmin(() => mkParty(A, { creditLimit: 10000 }));
  await post(A, limited, 8000, "2026-01-01"); // long overdue
  const c1 = await run(() => sales.getCreditStatus(A._id, limited._id, 1500));
  assert.deepEqual([c1.allowed, c1.available, c1.hasOverdue, c1.overdueAmount], [true, 2000, true, 8000]);
  const c2 = await run(() => sales.getCreditStatus(A._id, limited._id, 2500));
  assert.deepEqual([c2.allowed, c2.reason], [false, "CREDIT_LIMIT_EXCEEDED"]);

  const cash = await asAdmin(() => mkParty(A, { creditLimit: 0 }));
  assert.equal((await run(() => sales.getCreditStatus(A._id, cash._id, 100))).reason, "CASH_CUSTOMER");
  await pay(A, cash, 1000); // advance on account
  assert.equal((await run(() => sales.getCreditStatus(A._id, cash._id, 800))).allowed, true);
  assert.equal((await run(() => sales.getCreditStatus(A._id, cash._id, 1200))).allowed, false);

  const none = await asAdmin(() => mkParty(A)); // creditLimit never set
  const c3 = await run(() => sales.getCreditStatus(A._id, none._id, 99999));
  assert.deepEqual([c3.allowed, c3.limitSet, c3.reason], [true, false, "NO_LIMIT_SET"]);
});

test("ageing buckets by days past due, with advances shown separately", async () => {
  const p = await asAdmin(() => mkParty(A, { creditDays: 0 }));
  await post(A, p, 100, "2026-10-20"); // due 20 Oct: not yet due on 20 Oct
  await post(A, p, 200, "2026-10-10"); // 10 days late
  await post(A, p, 400, "2026-09-10"); // 40 days late
  await post(A, p, 800, "2026-08-01"); // 80 days late
  await post(A, p, 1600, "2026-06-01"); // 141 days late
  const r = await run(() => sales.getAgeing(A._id, { asOf: "2026-10-20" }));
  const row = r.rows.find((x) => String(x.partyId) === String(p._id));
  assert.deepEqual([row.current, row.d1_30, row.d31_60, row.d61_90, row.d90_plus, row.total], [100, 200, 400, 800, 1600, 3100]);
  await pay(A, p, 3100);
  await pay(A, p, 50); // advance
  const after = (await run(() => sales.getAgeing(A._id, { asOf: "2026-10-20" }))).rows.find((x) => String(x.partyId) === String(p._id));
  assert.deepEqual([after.total, after.advance, after.net], [0, 50, -50]);
});

test("concurrent identical payments (same key) post once; concurrent payments never over-allocate", async () => {
  const p = await asAdmin(() => mkParty(A));
  const r = await post(A, p, 1000, "2026-10-01");
  const same = await Promise.all(Array.from({ length: 5 }, () => pay(A, p, 300, { idempotencyKey: "pay-key-0001" })));
  assert.equal(new Set(same.map((x) => String(x.payment._id))).size, 1);
  assert.equal(same.filter((x) => !x.duplicate).length, 1);
  assert.equal(await bal(A, p), 700);
  await Promise.all(Array.from({ length: 10 }, () => pay(A, p, 100)));
  assert.equal(await bal(A, p), -300); // 1,000 invoiced - 1,300 received
  const rec = await recOf(r._id);
  assert.deepEqual([rec.paid, rec.status], [1000, "Paid"]); // never more than the invoice
  assert.equal((await recon(A, p)).ok, true);
});

test("ledger entries and payments cannot be edited or deleted", async () => {
  const e = await asAdmin(() => PartyLedger.findOne({ companyId: A._id }));
  await assert.rejects(PartyLedger.updateOne({ _id: e._id }, { $set: { amount: 1 } }), /append-only/);
  await assert.rejects(PartyLedger.deleteOne({ _id: e._id }), /append-only/);
});

test("a failure after the ledger write rolls the whole payment back", async (t) => {
  const p = await asAdmin(() => mkParty(A));
  const r = await post(A, p, 900, "2026-10-01");
  t.mock.method(Payment, "create", async () => { throw new Error("simulated crash saving the payment"); });
  await assert.rejects(pay(A, p, 900), /simulated crash/);
  t.mock.restoreAll();
  assert.equal(await bal(A, p), 900);
  assert.deepEqual([(await recOf(r._id)).paid, (await recOf(r._id)).status], [0, "Open"]);
  assert.equal(await asAdmin(() => PartyLedger.countDocuments({ companyId: A._id, partyId: p._id, txnType: "PAYMENT" })), 0);
});

// ── Legacy invoice hook + HTTP + isolation ─────────────────────────────────

const call = (method, url, who, body) => request(app)[method](url).set("Authorization", `Bearer ${tokens[who]}`).send(body);

test("legacy: creating, editing and deleting an invoice through the old API keeps the ledger in step", async () => {
  const p = await asAdmin(() => mkParty(A));
  const created = await call("post", "/api/invoices", "alice", {
    invoiceNumber: `LEG-${++seq}`, invoiceDate: "2026-10-05", customerId: String(p._id), customerName: p.firmName, grandTotal: 2400, status: "created", paymentTerms: "30 Days", company: String(A._id),
  });
  assert.equal(created.status, 201);
  assert.equal(await bal(A, p), 2400);
  const edited = await call("put", `/api/invoices/${created.body._id}`, "alice", { grandTotal: 2600 });
  assert.equal(edited.status, 200);
  assert.equal(await bal(A, p), 2600);
  const deleted = await call("delete", `/api/invoices/${created.body._id}`, "alice");
  assert.equal(deleted.status, 200);
  assert.equal(await bal(A, p), 0);
  assert.equal((await recon(A, p)).ok, true);
});

test("legacy: an invoice with no linked customer is saved normally and simply not posted", async () => {
  const res = await call("post", "/api/invoices", "alice", { invoiceNumber: `LEG-${++seq}`, invoiceDate: "2026-10-05", customerName: "Walk-in", grandTotal: 100, status: "created", company: String(A._id) });
  assert.equal(res.status, 201);
  assert.equal(await asAdmin(() => Receivable.countDocuments({ invoiceId: String(res.body._id) })), 0);
});

test("API: record a payment, read the statement and credit status", async () => {
  const p = await asAdmin(() => mkParty(A, { creditLimit: 50000 }));
  await post(A, p, 12000, "2026-10-01");
  const pr = await call("post", "/api/v3/sales/payments", "alice", { partyId: String(p._id), amount: 5000, mode: "UPI", reference: "UTR123" });
  assert.equal(pr.status, 201);
  assert.match(pr.body.payment.number, /^PR-\d{4}$/);
  const st = await call("get", `/api/v3/sales/parties/${p._id}/statement`, "alice");
  assert.equal(st.body.closingBalance, 7000);
  const cr = await call("get", `/api/v3/sales/parties/${p._id}/credit?amount=40000`, "alice");
  assert.equal(cr.body.allowed, true);
  assert.equal(cr.body.available, 43000);
  assert.equal((await call("get", `/api/v3/sales/parties/${p._id}/reconcile`, "alice")).body.ok, true);
});

test("API: input is validated", async () => {
  const p = await asAdmin(() => mkParty(A));
  assert.equal((await call("post", "/api/v3/sales/payments", "alice", { partyId: String(p._id), amount: -5, mode: "CASH" })).status, 400);
  assert.equal((await call("post", "/api/v3/sales/payments", "alice", { partyId: String(p._id), amount: 5, mode: "BARTER" })).status, 400);
  assert.equal((await call("post", "/api/v3/sales/payments", "alice", { partyId: String(p._id), amount: 5, mode: "CASH", runningBalance: 1 })).status, 400);
});

test("API: a user of A cannot touch B's customers, payments or receivables", async () => {
  const bp = await asAdmin(() => mkParty(B));
  await post(B, bp, 3000, "2026-10-01");
  const pr = await run(() => sales.recordPayment({ companyId: B._id, partyId: bp._id, amount: 1000, mode: "CASH" }));
  assert.equal((await call("post", "/api/v3/sales/payments", "alice", { partyId: String(bp._id), amount: 100, mode: "CASH" })).status, 404); // B's customer, A's company
  assert.equal((await call("post", "/api/v3/sales/payments", "alice", { companyId: String(B._id), partyId: String(bp._id), amount: 100, mode: "CASH" })).status, 403);
  assert.equal((await call("get", `/api/v3/sales/parties/${bp._id}/statement`, "alice")).status, 404);
  assert.equal((await call("get", `/api/v3/sales/payments/${pr.payment._id}`, "alice")).status, 404);
  assert.equal((await call("post", `/api/v3/sales/payments/${pr.payment._id}/reverse`, "alice", { reason: "hijack" })).status, 404);
  assert.equal((await call("get", `/api/v3/sales/receivables?companyId=${B._id}`, "alice")).status, 403);
  assert.equal((await call("get", "/api/v3/sales/receivables", "bob")).body.length > 0, true);
  assert.equal((await call("get", "/api/v3/sales/receivables/ageing", "alice")).body.rows.every((r) => r.name !== bp.firmName), true);
  assert.equal(await bal(B, bp), 2000); // untouched
});
