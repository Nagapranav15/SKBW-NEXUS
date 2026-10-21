/** Management reports: figures must tie out to the ledgers they are read from. Hand-calculated expectations. */
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
const SkuV2 = require("../src/models/skuV2Model");
const SalesInvoice = require("../src/models/salesInvoiceModel");
const SalesOrderV2 = require("../src/models/salesOrderV2Model");
const DeliveryChallan = require("../src/models/deliveryChallanModel");
const stock = require("../src/core/stock/stockService");
const conv = require("../src/core/conversions/conversionService");
const sales = require("../src/core/sales/salesService");
const { generateToken } = require("../src/utils/jwt");

const asAdmin = (fn) => scope.runWithScope({ superAdmin: true }, fn);
let repl, A, B, tokens, c1, c2, loc, paper, sheets, seq = 0;
const get = (url, who) => request(app).get(url).set("Authorization", `Bearer ${tokens[who]}`);

const mkItem = (company, code, unit) => SkuV2.create({ skuCode: code, name: code, category: "X", unit, company: company._id });
const mkOrder = (over) => SalesOrderV2.create({
  orderNumber: `SO-${++seq}`, company: A._id, customerName: "Cust", orderDate: new Date("2026-10-01"), grandTotal: 1000, status: "Confirmed",
  items: [{ skuCode: "X", itemName: "X", quantity: 100, unitPrice: 10, taxableAmount: 1000, totalAmount: 1000, dispatchedQty: 0 }], ...over,
});
const withDispatched = (n) => [{ skuCode: "X", itemName: "X", quantity: 100, unitPrice: 10, taxableAmount: 1000, totalAmount: 1000, dispatchedQty: n }];

test.before(async () => {
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(repl.getUri());
  await asAdmin(async () => {
    A = await Company.create({ name: "A", address: "a", phone: "1", email: "a@a.com", gst: "A" });
    B = await Company.create({ name: "B", address: "b", phone: "2", email: "b@b.com", gst: "B" });
    const perms = await Permission.insertMany(["VIEW_REPORTS"].map((name) => ({ name })));
    const viewer = await Role.create({ name: "viewer", permissions: perms.map((p) => p._id) });
    const noReports = await Role.create({ name: "noreports", permissions: [] });
    const mk = (username, role, companies) => User.create({ username, fullName: username, email: `${username}@t.com`, password: "x", role: role._id, companies });
    tokens = { alice: generateToken(await mk("alice", viewer, [A._id])), bob: generateToken(await mk("bob", viewer, [B._id])), nope: generateToken(await mk("nope", noReports, [A._id])) };

    paper = await mkItem(A, "RM-PAPER", "KG");
    sheets = await mkItem(A, "SM-SHEETS", "PCS");
    loc = new mongoose.Types.ObjectId();
    c1 = await Party.create({ type: "customer", firmName: "Alpha Books", company: A._id, creditDays: 30 });
    c2 = await Party.create({ type: "customer", firmName: "Beta Stationers", company: A._id, creditDays: 30 });
  });
});
test.after(async () => { await mongoose.disconnect(); await repl.stop(); });

const mkInvoice = (party, total, invoiceDate) => SalesInvoice.create({ invoiceNumber: `INV-${++seq}`, invoiceDate, customerId: party._id, customerName: party.firmName, grandTotal: total, company: A._id, status: "created", dueDate: "" });
const postInv = (party, total, date) => asAdmin(async () => { const i = await mkInvoice(party, total, date); await sales.postInvoice({ companyId: A._id, invoiceId: String(i._id) }); return i; });

test("seed: stock, a sheeting conversion, invoices and payments", async () => {
  await asAdmin(async () => {
    const b = await stock.receiveReels({ companyId: A._id, itemId: paper._id, locationId: loc, ratePerKg: 80, reels: [{ reelNumber: "R1", weightKg: 500 }] });
    await conv.postSheeting({
      companyId: A._id, reelItemId: paper._id, targetItemId: sheets._id, sourceLocationId: loc, destinationLocationId: loc,
      reels: [{ reelId: b.reels[0]._id, weightKg: 500 }], sheet: { widthCm: 57, lengthCm: 70, gsm: 52 }, actualSheets: 24000, additionalCosts: [{ kind: "PROCESSING", amount: 3000 }],
    });
  });
  await postInv(c1, 10000, "2026-09-05"); // due 5 Oct
  await postInv(c1, 5000, "2026-10-10");
  await postInv(c2, 8000, "2026-10-12");
  await asAdmin(() => sales.recordPayment({ companyId: A._id, partyId: c1._id, amount: 12000, mode: "UPI", date: "2026-10-15" }));
  await asAdmin(() => sales.recordPayment({ companyId: A._id, partyId: c2._id, amount: 3000, mode: "CASH", date: "2026-10-16" }));
});

test("overview ties out to the ledgers", async () => {
  const res = await get("/api/v3/reports/overview", "alice");
  assert.equal(res.status, 200);
  const o = res.body;
  assert.equal(o.invoiced.amount, 23000); // 10,000 + 5,000 + 8,000
  assert.equal(o.invoiced.count, 3);
  assert.equal(o.collections.amount, 15000);
  assert.deepEqual(o.collections.byMode.map((m) => [m.mode, m.amount]).sort(), [["CASH", 3000], ["UPI", 12000]]);
  assert.equal(o.receivables.outstanding, 8000); // 23,000 invoiced - 15,000 received
  assert.equal(o.stock.totalValue, 43000); // 24,000 sheets worth 43,000 (paper fully consumed)
  assert.equal(o.production.conversions, 1);
  assert.equal(o.production.netCost, 43000);
  assert.deepEqual(o.receivables.topDebtors.map((d) => [d.name, d.outstanding]), [["Beta Stationers", 5000], ["Alpha Books", 3000]]);
});

test("overview respects the date range", async () => {
  const res = await get("/api/v3/reports/overview?from=2026-10-10&to=2026-10-31", "alice");
  assert.equal(res.body.invoiced.amount, 13000); // 5,000 + 8,000 (the 5 Sep invoice is out of range)
  assert.equal(res.body.collections.amount, 15000);
  const none = await get("/api/v3/reports/overview?from=2025-01-01&to=2025-12-31", "alice");
  assert.deepEqual([none.body.invoiced.amount, none.body.collections.amount], [0, 0]);
});

test("sales report by month and by customer", async () => {
  const byMonth = await get("/api/v3/reports/sales?groupBy=month", "alice");
  assert.deepEqual(byMonth.body.rows.map((r) => [r.key, r.invoiced]), [["2026-09", 10000], ["2026-10", 13000]]);
  assert.equal(byMonth.body.totals.invoiced, 23000);
  assert.equal(byMonth.body.totals.collected, 15000);
  assert.equal(byMonth.body.totals.outstanding, 8000);
  const byCust = await get("/api/v3/reports/sales?groupBy=customer", "alice");
  const alpha = byCust.body.rows.find((r) => r.name === "Alpha Books");
  assert.deepEqual([alpha.invoiced, alpha.collected, alpha.outstanding], [15000, 12000, 3000]);
});

test("stock movement and production reports", async () => {
  const mv = await get("/api/v3/reports/stock-movements", "alice");
  const by = Object.fromEntries(mv.body.map((m) => [m.txnType, m]));
  assert.deepEqual([by.RECEIPT.qtyIn, by.RECEIPT.value], [500, 40000]);
  assert.deepEqual([by.CONVERSION_OUT.qtyOut, by.CONVERSION_OUT.value], [500, 40000]);
  assert.deepEqual([by.CONVERSION_IN.qtyIn, by.CONVERSION_IN.value], [24000, 43000]);
  const prod = await get("/api/v3/reports/production", "alice");
  const sheeting = prod.body.find((p) => p.type === "SHEETING");
  assert.deepEqual([sheeting.conversions, sheeting.inputValue, sheeting.charges, sheeting.netCost], [1, 40000, 3000, 43000]);
  assert.deepEqual([sheeting.sheetsTheoretical, sheeting.sheetsActual, sheeting.yieldPercent], [24099, 24000, 99.6]);
});

test("pipeline derives each order's stage from orders, challans, invoices and receivables", async () => {
  await asAdmin(async () => {
    await mkOrder({ orderNumber: "SO-PENDING" });
    await mkOrder({ orderNumber: "SO-PROD", status: "In Production" });
    await mkOrder({ orderNumber: "SO-PART", items: withDispatched(40) });
    await mkOrder({ orderNumber: "SO-DISP", items: withDispatched(100), status: "Delivered" });
    await mkOrder({ orderNumber: "SO-INV", items: withDispatched(100), status: "Delivered" });
    await mkOrder({ orderNumber: "SO-PAID", items: withDispatched(100), status: "Delivered" });
    await mkOrder({ orderNumber: "SO-CANCELLED", status: "Cancelled" });
    await mkOrder({ orderNumber: "SO-DRAFT", status: "Draft" });
    await DeliveryChallan.create({ dcNumber: "DC-INV", customerName: "Cust", company: A._id, orderNumber: "SO-INV", invoiceStatus: "Invoiced", invoiceNumber: "X" });
    await DeliveryChallan.create({ dcNumber: "DC-PAID", customerName: "Cust", company: A._id, orderNumber: "SO-PAID", invoiceStatus: "Invoiced", invoiceNumber: "Y" });
    const unpaid = await mkInvoice(c2, 700, "2026-10-20");
    await SalesInvoice.updateOne({ _id: unpaid._id }, { $set: { orderNumber: "SO-INV" } });
    await sales.postInvoice({ companyId: A._id, invoiceId: String(unpaid._id) });
    const paid = await mkInvoice(c1, 900, "2026-10-20");
    await SalesInvoice.updateOne({ _id: paid._id }, { $set: { orderNumber: "SO-PAID" } });
    await sales.postInvoice({ companyId: A._id, invoiceId: String(paid._id) });
    await sales.recordPayment({ companyId: A._id, partyId: c1._id, amount: 900, mode: "CASH", allocations: [{ receivableId: String((await mongoose.model("Receivable").findOne({ invoiceId: String(paid._id) }))._id), amount: 900 }] });
  });
  const res = await get("/api/v3/reports/pipeline", "alice");
  const stageOf = Object.fromEntries(res.body.rows.map((r) => [r.orderNumber, r.stage]));
  assert.deepEqual(stageOf, { "SO-PENDING": "PENDING", "SO-PROD": "IN_PRODUCTION", "SO-PART": "PARTLY_DISPATCHED", "SO-DISP": "DISPATCHED", "SO-INV": "INVOICED", "SO-PAID": "PAID" });
  assert.equal(res.body.counts.PENDING.orders, 1);
  assert.equal(res.body.counts.PAID.value, 1000);
});

test("reports are company-isolated and permission-protected", async () => {
  const bob = await get("/api/v3/reports/overview", "bob");
  assert.equal(bob.status, 200);
  assert.deepEqual([bob.body.invoiced.amount, bob.body.collections.amount, bob.body.stock.totalValue, bob.body.production.conversions], [0, 0, 0, 0]);
  assert.equal((await get("/api/v3/reports/pipeline", "bob")).body.rows.length, 0);
  assert.equal((await get(`/api/v3/reports/overview?companyId=${A._id}`, "bob")).status, 403);
  assert.equal((await get("/api/v3/reports/overview", "nope")).status, 403); // no VIEW_REPORTS permission
  assert.equal((await get("/api/v3/reports/sales?groupBy=nonsense", "alice")).status, 400);
});
