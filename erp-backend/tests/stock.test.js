/**
 * Stock engine against a real (in-memory) MongoDB replica set, so transactions behave like production.
 * Covers: receipts and moving average, issues, negative-stock rule, transfers, adjustments, reels,
 * atomic rollback, concurrency, idempotency, ledger immutability, reconciliation and company isolation.
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
const SkuV2 = require("../src/models/skuV2Model");
const stock = require("../src/core/stock/stockService");
const { StockLedger, ItemCost, StockBalance, Reel } = require("../src/core/stock/models");
const { generateToken } = require("../src/utils/jwt");

const asAdmin = (fn) => scope.runWithScope({ superAdmin: true }, fn);
let repl, A, B, paperA, paperB, sheetsA, locFactory, locGodown, tokens;

const mkItem = (company, skuCode, unit) =>
  SkuV2.create({ skuCode, name: skuCode, category: "Paper", unit, company: company._id });
const cost = (companyId, itemId) => asAdmin(() => stock.getItemCost(companyId, itemId));
const recon = (companyId, itemId) => asAdmin(() => stock.reconcile(companyId, itemId));
const run = (fn) => asAdmin(fn);

test.before(async () => {
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(repl.getUri());
  await asAdmin(async () => {
    A = await Company.create({ name: "A", address: "a", phone: "1", email: "a@a.com", gst: "A" });
    B = await Company.create({ name: "B", address: "b", phone: "2", email: "b@b.com", gst: "B" });
    paperA = await mkItem(A, "RM-PAPER-A", "KG");
    paperB = await mkItem(B, "RM-PAPER-B", "KG");
    sheetsA = await mkItem(A, "SM-SHEETS-A", "PCS");
    locFactory = new mongoose.Types.ObjectId();
    locGodown = new mongoose.Types.ObjectId();

    const perms = await Permission.insertMany(["MANAGE_INVENTORY", "VIEW_INVENTORY"].map((name) => ({ name })));
    const adminRole = await Role.create({ name: "admin", permissions: [] });
    const manager = await Role.create({ name: "manager", permissions: perms.map((p) => p._id) });
    const mk = (username, role, companies) => User.create({ username, fullName: username, email: `${username}@t.com`, password: "x", role: role._id, companies });
    tokens = {
      root: generateToken(await mk("root", adminRole, [])),
      alice: generateToken(await mk("alice", manager, [A._id])),
      bob: generateToken(await mk("bob", manager, [B._id])),
    };
  });
});

test.after(async () => {
  await mongoose.disconnect();
  await repl.stop();
});

test("receipts move the moving-average cost and write ledger entries", async () => {
  const r1 = await run(() => stock.receive({ companyId: A._id, itemId: paperA._id, locationId: locFactory, qty: 300, unitCost: 80 }));
  assert.equal(r1.entry.runningQty, 300);
  assert.equal(r1.entry.avgCost, 80);
  const r2 = await run(() => stock.receive({ companyId: A._id, itemId: paperA._id, locationId: locFactory, qty: 100, unitCost: 100 }));
  assert.deepEqual([r2.entry.runningQty, r2.entry.runningValue, r2.entry.avgCost], [400, 34000, 85]);
  assert.deepEqual(await cost(A._id, paperA._id).then((c) => [c.qty, c.value, c.avgCost]), [400, 34000, 85]);
  assert.equal((await recon(A._id, paperA._id)).ok, true);
});

test("an issue is valued at the average and leaves the average unchanged", async () => {
  const out = await run(() => stock.issue({ companyId: A._id, itemId: paperA._id, locationId: locFactory, qty: 100, referenceType: "CUTTING", referenceId: "CS-1" }));
  assert.equal(out.entry.unitCost, 85);
  assert.equal(out.entry.totalValue, 8500);
  assert.deepEqual([out.itemState.qty, out.itemState.value, out.itemState.avgCost], [300, 25500, 85]);
  assert.equal((await recon(A._id, paperA._id)).ok, true);
});

test("negative stock is refused and nothing is written", async () => {
  const before = await asAdmin(() => StockLedger.countDocuments({ companyId: A._id, itemId: paperA._id }));
  await assert.rejects(
    run(() => stock.issue({ companyId: A._id, itemId: paperA._id, locationId: locFactory, qty: 9999 })),
    (e) => e.code === "INSUFFICIENT_STOCK" && e.status === 409,
  );
  assert.equal(await asAdmin(() => StockLedger.countDocuments({ companyId: A._id, itemId: paperA._id })), before);
  assert.equal((await cost(A._id, paperA._id)).qty, 300);
});

test("issuing more than the location holds is refused even if the company has the stock elsewhere", async () => {
  await assert.rejects(
    run(() => stock.issue({ companyId: A._id, itemId: paperA._id, locationId: locGodown, qty: 10 })),
    (e) => e.code === "INSUFFICIENT_STOCK_AT_LOCATION",
  );
});

test("a transfer moves quantity between locations without changing value or average", async () => {
  const before = await cost(A._id, paperA._id);
  const t = await run(() => stock.transfer({ companyId: A._id, itemId: paperA._id, fromLocationId: locFactory, toLocationId: locGodown, qty: 120 }));
  assert.equal(t.out.txnType, "TRANSFER_OUT");
  assert.equal(t.in.txnType, "TRANSFER_IN");
  const after = await cost(A._id, paperA._id);
  assert.deepEqual([after.qty, after.value, after.avgCost], [before.qty, before.value, before.avgCost]);
  const bal = await asAdmin(() => stock.getBalances(A._id, { itemId: paperA._id }));
  const at = (loc) => bal.find((b) => String(b.locationId) === String(loc)).qty;
  assert.equal(at(locFactory), 180);
  assert.equal(at(locGodown), 120);
  assert.equal((await recon(A._id, paperA._id)).ok, true);
});

test("transfer to the same location is rejected", async () => {
  await assert.rejects(run(() => stock.transfer({ companyId: A._id, itemId: paperA._id, fromLocationId: locFactory, toLocationId: locFactory, qty: 1 })), (e) => e.code === "SAME_LOCATION");
});

test("adjustments need a reason; found stock is valued at the current average", async () => {
  await assert.rejects(run(() => stock.adjust({ companyId: A._id, itemId: paperA._id, locationId: locFactory, direction: "IN", qty: 5 })), (e) => e.code === "REASON_REQUIRED");
  const adj = await run(() => stock.adjust({ companyId: A._id, itemId: paperA._id, locationId: locFactory, direction: "IN", qty: 10, reason: "Stock count: found extra" }));
  assert.equal(adj.entry.txnType, "ADJUSTMENT_IN");
  assert.equal(adj.entry.unitCost, 85);
  assert.equal(adj.itemState.avgCost, 85);
  const loss = await run(() => stock.adjust({ companyId: A._id, itemId: paperA._id, locationId: locFactory, direction: "OUT", qty: 10, reason: "Damaged in godown" }));
  assert.equal(loss.entry.totalValue, 850);
  assert.equal((await recon(A._id, paperA._id)).ok, true);
});

test("the same idempotency key posts only once", async () => {
  const key = "receipt-key-0001";
  const first = await run(() => stock.receive({ companyId: A._id, itemId: sheetsA._id, locationId: locFactory, qty: 50, unitCost: 2, idempotencyKey: key }));
  const again = await run(() => stock.receive({ companyId: A._id, itemId: sheetsA._id, locationId: locFactory, qty: 50, unitCost: 2, idempotencyKey: key }));
  assert.equal(first.duplicate, false);
  assert.equal(again.duplicate, true);
  assert.equal(String(again.entry._id), String(first.entry._id));
  assert.equal((await cost(A._id, sheetsA._id)).qty, 50);
});

test("a failure part-way through rolls the whole movement back", async (t) => {
  const before = await cost(A._id, sheetsA._id);
  const ledgerBefore = await asAdmin(() => StockLedger.countDocuments({ companyId: A._id, itemId: sheetsA._id }));
  const balBefore = (await asAdmin(() => stock.getBalances(A._id, { itemId: sheetsA._id }))).reduce((s, b) => s + b.qty, 0);
  // Cost and balance are updated first, then the ledger insert fails: everything must be undone
  t.mock.method(StockLedger, "create", async () => { throw new Error("simulated crash while writing the ledger"); });
  await assert.rejects(run(() => stock.receive({ companyId: A._id, itemId: sheetsA._id, locationId: locFactory, qty: 25, unitCost: 3 })), /simulated crash/);
  t.mock.restoreAll();
  const after = await cost(A._id, sheetsA._id);
  assert.deepEqual([after.qty, after.value, after.avgCost], [before.qty, before.value, before.avgCost]);
  assert.equal(await asAdmin(() => StockLedger.countDocuments({ companyId: A._id, itemId: sheetsA._id })), ledgerBefore);
  const balAfter = (await asAdmin(() => stock.getBalances(A._id, { itemId: sheetsA._id }))).reduce((s, b) => s + b.qty, 0);
  assert.equal(balAfter, balBefore);
});

test("concurrent receipts never lose an update", async () => {
  const item = await asAdmin(() => mkItem(A, "SM-CONCURRENT", "PCS"));
  await Promise.all(Array.from({ length: 20 }, () => run(() => stock.receive({ companyId: A._id, itemId: item._id, locationId: locFactory, qty: 1, unitCost: 10 }))));
  const c = await cost(A._id, item._id);
  assert.deepEqual([c.qty, c.value, c.avgCost], [20, 200, 10]);
  assert.equal(await asAdmin(() => StockLedger.countDocuments({ companyId: A._id, itemId: item._id })), 20);
  assert.equal((await recon(A._id, item._id)).ok, true);
});

test("concurrent issues cannot oversell", async () => {
  const item = await asAdmin(() => mkItem(A, "SM-OVERSELL", "PCS"));
  await run(() => stock.receive({ companyId: A._id, itemId: item._id, locationId: locFactory, qty: 5, unitCost: 10 }));
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => run(() => stock.issue({ companyId: A._id, itemId: item._id, locationId: locFactory, qty: 1 }))));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 5);
  assert.equal(results.filter((r) => r.status === "rejected").length, 5);
  const c = await cost(A._id, item._id);
  assert.deepEqual([c.qty, c.value], [0, 0]);
  assert.equal((await recon(A._id, item._id)).ok, true);
});

test("ledger entries cannot be edited or deleted", async () => {
  const entry = await asAdmin(() => StockLedger.findOne({ companyId: A._id }));
  await assert.rejects(StockLedger.updateOne({ _id: entry._id }, { $set: { qtyIn: 999 } }), /append-only/);
  await assert.rejects(StockLedger.deleteOne({ _id: entry._id }), /append-only/);
  entry.qtyIn = 999;
  await assert.rejects(entry.save(), /append-only/);
});

test("an item from another company cannot be used", async () => {
  await assert.rejects(run(() => stock.receive({ companyId: A._id, itemId: paperB._id, locationId: locFactory, qty: 1, unitCost: 1 })), (e) => e.code === "ITEM_NOT_FOUND");
});

test("receiving reels creates traceable reels and one receipt for the total weight", async () => {
  const res = await run(() => stock.receiveReels({
    companyId: A._id, itemId: paperA._id, locationId: locFactory, purchaseRef: "PB-1001", ratePerKg: 80,
    reels: [{ reelNumber: "R-001", weightKg: 250.5, gsm: 52, widthCm: 57 }, { reelNumber: "R-002", weightKg: 249.5, gsm: 52, widthCm: 57 }],
  }));
  assert.equal(res.reels.length, 2);
  assert.equal(res.entry.qtyIn, 500);
  assert.equal(res.entry.totalValue, 40000);
  assert.ok(res.reels.every((r) => r.unitCostPerKg === 80 && String(r.receiptLedgerId) === String(res.entry._id) && r.status === "Available"));
  assert.equal((await recon(A._id, paperA._id)).ok, true);
});

test("duplicate reel numbers are rejected atomically (no stock is added)", async () => {
  const before = await cost(A._id, paperA._id);
  await assert.rejects(run(() => stock.receiveReels({ companyId: A._id, itemId: paperA._id, locationId: locFactory, ratePerKg: 80, reels: [{ reelNumber: "R-NEW", weightKg: 100 }, { reelNumber: "R-001", weightKg: 100 }] })), (e) => e.code === "DUPLICATE_REEL");
  const after = await cost(A._id, paperA._id);
  assert.deepEqual([after.qty, after.value], [before.qty, before.value]);
  assert.equal(await asAdmin(() => Reel.countDocuments({ companyId: A._id, reelNumber: "R-NEW" })), 0);
});

test("reels can only be received for items stocked in KG", async () => {
  await assert.rejects(run(() => stock.receiveReels({ companyId: A._id, itemId: sheetsA._id, ratePerKg: 1, reels: [{ reelNumber: "R-X", weightKg: 1 }] })), (e) => e.code === "ITEM_NOT_IN_KG");
});

test("valuation totals match the sum of item values", async () => {
  const v = await run(() => stock.getValuation(A._id));
  const sum = v.lines.reduce((s, l) => s + l.value, 0);
  assert.equal(Math.round(v.totalValue * 100), Math.round(sum * 100));
  assert.ok(v.lines.find((l) => l.skuCode === "RM-PAPER-A"));
});

// ── HTTP + company isolation ────────────────────────────────────────────────

const post = (url, who, body) => request(app).post(url).set("Authorization", `Bearer ${tokens[who]}`).send(body);
const get = (url, who) => request(app).get(url).set("Authorization", `Bearer ${tokens[who]}`);

test("API: a company user posts to their own company without naming it", async () => {
  const res = await post("/api/v3/stock/receipts", "alice", { itemId: String(sheetsA._id), locationId: String(locFactory), qty: 10, unitCost: 4 });
  assert.equal(res.status, 201);
  assert.equal(String(res.body.entry.companyId), String(A._id));
});

test("API: a user of A cannot post stock to company B, nor read B's valuation", async () => {
  const w = await post("/api/v3/stock/receipts", "alice", { companyId: String(B._id), itemId: String(paperB._id), qty: 5, unitCost: 1 });
  assert.equal(w.status, 403);
  const r = await get(`/api/v3/stock/valuation?companyId=${B._id}`, "alice");
  assert.equal(r.status, 403);
  assert.equal(await asAdmin(() => StockLedger.countDocuments({ companyId: B._id })), 0);
});

test("API: a user of A cannot post B's item into A via the item ID", async () => {
  const res = await post("/api/v3/stock/receipts", "alice", { itemId: String(paperB._id), qty: 5, unitCost: 1 });
  assert.equal(res.status, 404);
});

test("API: the super admin must name the company and can act on any", async () => {
  assert.equal((await post("/api/v3/stock/receipts", "root", { itemId: String(paperB._id), qty: 5, unitCost: 1 })).status, 400);
  const ok = await post("/api/v3/stock/receipts", "root", { companyId: String(B._id), itemId: String(paperB._id), qty: 5, unitCost: 1 });
  assert.equal(ok.status, 201);
});

test("API: input is validated (no unknown fields, no bad numbers)", async () => {
  const bad = await post("/api/v3/stock/receipts", "alice", { itemId: String(sheetsA._id), qty: -1, unitCost: 1 });
  assert.equal(bad.status, 400);
  const extra = await post("/api/v3/stock/receipts", "alice", { itemId: String(sheetsA._id), qty: 1, unitCost: 1, runningQty: 99999 });
  assert.equal(extra.status, 400);
  const noCost = await post("/api/v3/stock/receipts", "alice", { itemId: String(sheetsA._id), qty: 1 });
  assert.equal(noCost.status, 400);
});

test("API: insufficient stock returns 409 with the available quantity", async () => {
  const res = await post("/api/v3/stock/issues", "alice", { itemId: String(sheetsA._id), locationId: String(locFactory), qty: 100000 });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, "INSUFFICIENT_STOCK");
  assert.ok(res.body.details.available >= 0);
});

test("API: ledger and reconcile endpoints return the company's own data", async () => {
  const led = await get(`/api/v3/stock/ledger?itemId=${paperA._id}`, "alice");
  assert.equal(led.status, 200);
  assert.ok(led.body.rows.length > 0 && led.body.rows.every((r) => String(r.companyId) === String(A._id)));
  const rec = await get(`/api/v3/stock/items/${paperA._id}/reconcile`, "alice");
  assert.equal(rec.body.ok, true);
});

test("API: a company user can post the very first receipt of a brand-new item (upsert is scoped, not broken)", async () => {
  const fresh = await asAdmin(() => mkItem(A, "SM-BRAND-NEW", "PCS"));
  const res = await post("/api/v3/stock/receipts", "alice", { itemId: String(fresh._id), locationId: String(locFactory), qty: 7, unitCost: 2 });
  assert.equal(res.status, 201);
  assert.equal((await cost(A._id, fresh._id)).qty, 7);
});
