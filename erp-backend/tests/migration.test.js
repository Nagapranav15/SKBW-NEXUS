/**
 * Migration from legacy-shaped data: dry-run is read-only, problem items are reported and skipped, totals
 * reconcile, re-running is safe, and legacy data is never touched.
 */
process.env.JWT_SECRET = "test-secret-".padEnd(48, "x");
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

const scope = require("../src/core/companyScope");
scope.registerPlugin();
require("../src/app"); // registers every model
const Company = require("../src/models/companyModel");
const Party = require("../src/models/partyModel");
const SkuV2 = require("../src/models/skuV2Model");
const InventoryLedger = require("../src/models/inventoryLedgerModelV2");
const migration = require("../src/core/migration/migrationService");
const sales = require("../src/core/sales/salesService");
const { StockLedger, ItemCost, StockBalance } = require("../src/core/stock/models");
const { PartyLedger, Receivable } = require("../src/core/sales/models");

const asAdmin = (fn) => scope.runWithScope({ superAdmin: true }, fn);
let repl, A, B, loc1, loc2, sku = {}, p = {}, tx = 0;

const mkSku = (code, unit, cost = {}) => SkuV2.create({ skuCode: code, name: code, category: "X", unit, company: A._id, ...cost });
const entry = (skuDoc, locationId, direction, quantity, over = {}) => {
  const id = new mongoose.Types.ObjectId();
  return InventoryLedger.create({
    transactionNumber: `IL-${++tx}`, transactionType: direction === "IN" ? "Opening Stock" : "Sale", skuId: skuDoc._id, quantity, unit: skuDoc.unit, direction,
    referenceType: "Test", referenceId: `ref-${tx}`, warehouseId: id, floorId: id, zoneId: id, locationId, company: A._id, status: "Posted", ...over,
  });
};

test.before(async () => {
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(repl.getUri());
  await asAdmin(async () => {
    A = await Company.create({ name: "A", address: "a", phone: "1", email: "a@a.com", gst: "A" });
    B = await Company.create({ name: "B", address: "b", phone: "2", email: "b@b.com", gst: "B" });
    loc1 = new mongoose.Types.ObjectId();
    loc2 = new mongoose.Types.ObjectId();

    // A: two locations, one OUT, a cancelled entry that must be ignored. 70 + 50 = 120 @ 10 (avgRate)
    sku.good = await mkSku("GOOD", "PCS", { avgRate: 10 });
    await entry(sku.good, loc1, "IN", 100); await entry(sku.good, loc2, "IN", 50); await entry(sku.good, loc1, "OUT", 30);
    await entry(sku.good, loc1, "IN", 999, { status: "Cancelled" });
    // Cost fields agree within 1%: still fine. 200 kg @ 80 (ratePerKg 80.4 is within tolerance of avgCost 80)
    sku.agree = await mkSku("AGREE", "KG", { avgCost: 80, ratePerKg: 80.4 });
    await entry(sku.agree, loc1, "IN", 200);
    // Problems
    sku.negative = await mkSku("NEGATIVE", "PCS", { avgRate: 5 }); await entry(sku.negative, loc1, "IN", 5); await entry(sku.negative, loc1, "OUT", 10);
    sku.nocost = await mkSku("NOCOST", "PCS"); await entry(sku.nocost, loc1, "IN", 40);
    sku.conflict = await mkSku("CONFLICT", "PCS", { avgCost: 10, purchasePrice: 15 }); await entry(sku.conflict, loc1, "IN", 20);
    sku.unit = await mkSku("UNITMIX", "KG", { avgRate: 7 }); await entry(sku.unit, loc1, "IN", 10, { unit: "GBL" });
    sku.empty = await mkSku("EMPTY", "PCS", { avgRate: 3 }); await entry(sku.empty, loc1, "IN", 10); await entry(sku.empty, loc1, "OUT", 10);
    // Another company's stock must never be touched
    await SkuV2.create({ skuCode: "OTHER-CO", name: "OTHER-CO", category: "X", unit: "PCS", company: B._id, avgRate: 1 });

    p.owes = await Party.create({ type: "customer", firmName: "Owes 5000", company: A._id, outstandingBalance: 5000, outstanding: 5000 });
    p.legacyOnly = await Party.create({ type: "customer", firmName: "Old field only", company: A._id, outstanding: 3000, outstandingBalance: 0 });
    p.differ = await Party.create({ type: "customer", firmName: "Fields differ", company: A._id, outstanding: 1000, outstandingBalance: 1200 });
    p.zero = await Party.create({ type: "customer", firmName: "Owes nothing", company: A._id, outstanding: 0, outstandingBalance: 0 });
    p.vendor = await Party.create({ type: "vendor", firmName: "A vendor", company: A._id, outstanding: 777 });
  });
});
test.after(async () => { await mongoose.disconnect(); await repl.stop(); });

const legacySnapshot = () => asAdmin(async () => ({
  skus: await SkuV2.find({ company: A._id }).lean(),
  ledger: await InventoryLedger.countDocuments({ company: A._id }),
  parties: await Party.find({ company: A._id }).select("outstanding outstandingBalance").lean(),
}));

test("cost resolution lists every candidate, picks by priority and flags real disagreement", () => {
  const r = migration.resolveLegacyCost({ avgCost: 10, purchasePrice: 15, rate: 12 });
  assert.deepEqual([r.unitCost, r.source, r.conflict, r.candidates.length], [10, "avgCost", true, 3]);
  assert.equal(migration.resolveLegacyCost({ avgCost: 80, ratePerKg: 80.4 }).conflict, false);
  assert.deepEqual([migration.resolveLegacyCost({}).unitCost, migration.resolveLegacyCost({}).source], [0, null]);
});

test("dry run reports what would migrate and why items are blocked, and changes nothing", async () => {
  const before = await legacySnapshot();
  const r = await asAdmin(() => migration.inspectCompany(A._id));
  const byCode = Object.fromEntries(r.stock.items.map((i) => [i.skuCode, i]));
  assert.equal(byCode.GOOD.totalQty, 120); // cancelled entry ignored
  assert.deepEqual(byCode.GOOD.locations.map((l) => l.qty).sort((a, b) => a - b), [50, 70]);
  assert.equal(byCode.GOOD.value, 1200);
  assert.deepEqual(byCode.GOOD.issues, []);
  assert.deepEqual(byCode.AGREE.issues, []);
  assert.deepEqual(byCode.NEGATIVE.issues, ["NEGATIVE_STOCK"]);
  assert.deepEqual(byCode.NOCOST.issues, ["NO_COST"]);
  assert.deepEqual(byCode.CONFLICT.issues, ["COST_CONFLICT"]);
  assert.deepEqual(byCode.UNITMIX.issues, ["UNIT_MISMATCH"]);
  assert.equal(byCode["OTHER-CO"], undefined); // other company's items never appear
  assert.equal(r.stock.migratable, 2); // GOOD and AGREE
  assert.equal(r.stock.quantityToMigrate, 320);
  assert.equal(r.stock.valueToMigrate, 1200 + 16000);
  assert.equal(r.parties.customersOwing, 3);
  assert.equal(r.parties.totalOutstanding, 5000 + 3000 + 1200);
  const differ = r.parties.parties.find((x) => x.name === "Fields differ");
  assert.deepEqual(differ.issues, ["BALANCE_FIELDS_DIFFER"]);
  assert.equal(r.parties.parties.find((x) => x.name === "A vendor"), undefined); // vendors are not receivables
  assert.deepEqual(await legacySnapshot(), before);
  assert.equal(await asAdmin(() => StockLedger.countDocuments({ companyId: A._id })), 0); // nothing written
});

test("apply migrates clean items per location, skips problem items, and reconciles", async () => {
  const before = await legacySnapshot();
  const report = await asAdmin(() => migration.applyCompany(A._id, { cutoverDate: "2026-10-01" }));
  assert.deepEqual(report.stock.posted.map((x) => x.skuCode).sort(), ["AGREE", "GOOD", "GOOD"]);
  const skipped = Object.fromEntries(report.stock.skipped.map((s) => [s.skuCode, s.reason]));
  assert.deepEqual(skipped, { NEGATIVE: "NEGATIVE_STOCK", NOCOST: "NO_COST", CONFLICT: "COST_CONFLICT", UNITMIX: "UNIT_MISMATCH" });
  assert.equal(report.stock.failed.length, 0);

  const good = await asAdmin(() => ItemCost.findOne({ companyId: A._id, itemId: sku.good._id }).lean());
  assert.deepEqual([good.qty, good.value, good.avgCost], [120, 1200, 10]);
  const bal = await asAdmin(() => StockBalance.find({ companyId: A._id, itemId: sku.good._id }).lean());
  assert.deepEqual(bal.map((b) => b.qty).sort((a, b) => a - b), [50, 70]);
  const e = await asAdmin(() => StockLedger.findOne({ companyId: A._id, itemId: sku.good._id }).lean());
  assert.deepEqual([e.txnType, e.referenceType], ["OPENING", "MIGRATION"]);

  // Parties: 'auto' trusts outstandingBalance when set, else the old field; differing fields are flagged
  assert.deepEqual(report.parties.posted.map((x) => [x.name, x.amount]).sort(), [["Fields differ", 1200], ["Old field only", 3000], ["Owes 5000", 5000]]);
  assert.deepEqual(report.parties.posted.find((x) => x.name === "Fields differ").flagged, ["BALANCE_FIELDS_DIFFER"]);
  const recs = await asAdmin(() => Receivable.find({ companyId: A._id, invoiceId: /^OPENING:/ }).lean());
  assert.equal(recs.length, 3);
  assert.equal(recs[0].dueDate.toISOString().slice(0, 10), "2026-10-01");

  assert.equal(report.reconciliation.ok, true);
  assert.deepEqual([report.reconciliation.stock.legacyQty, report.reconciliation.stock.migratedQty], [320, 320]);
  assert.deepEqual([report.reconciliation.parties.legacyOutstanding, report.reconciliation.parties.migratedBalance], [9200, 9200]);
  assert.deepEqual(await legacySnapshot(), before); // legacy data untouched
  for (const party of [p.owes, p.legacyOnly, p.differ]) assert.equal((await asAdmin(() => sales.reconcile(A._id, party._id))).ok, true);
});

test("re-running apply changes nothing (idempotent)", async () => {
  const ledgerBefore = await asAdmin(() => StockLedger.countDocuments({ companyId: A._id }));
  const partyBefore = await asAdmin(() => PartyLedger.countDocuments({ companyId: A._id }));
  const again = await asAdmin(() => migration.applyCompany(A._id, { cutoverDate: "2026-10-01" }));
  assert.equal(again.stock.posted.every((x) => x.alreadyDone), true);
  assert.equal(again.parties.posted.length, 0);
  assert.equal(again.parties.skipped.filter((s) => s.reason === "ALREADY_MIGRATED").length, 3);
  assert.equal(await asAdmin(() => StockLedger.countDocuments({ companyId: A._id })), ledgerBefore);
  assert.equal(await asAdmin(() => PartyLedger.countDocuments({ companyId: A._id })), partyBefore);
  assert.equal(again.reconciliation.ok, true);
});

test("a cost conflict can be migrated only when explicitly accepted", async () => {
  const r = await asAdmin(() => migration.applyCompany(A._id, { allowCostConflicts: true, only: "stock" }));
  assert.deepEqual(r.stock.posted.filter((x) => !x.alreadyDone).map((x) => [x.skuCode, x.unitCost]), [["CONFLICT", 10]]); // first field in priority order
  assert.equal(r.reconciliation.ok, true);
});

test("reconcile detects drift when a migrated figure no longer matches the legacy one", async () => {
  await asAdmin(() => InventoryLedger.create({
    transactionNumber: `IL-${++tx}`, transactionType: "Opening Stock", skuId: sku.good._id, quantity: 5, unit: "PCS", direction: "IN", referenceType: "Test", referenceId: "late",
    warehouseId: loc1, floorId: loc1, zoneId: loc1, locationId: loc1, company: A._id, status: "Posted",
  }));
  const r = await asAdmin(() => migration.reconcile(A._id));
  assert.equal(r.ok, false);
  assert.ok(r.mismatches.some((m) => m.kind === "STOCK_QTY" && m.skuCode === "GOOD" && m.legacy === 125 && m.migrated === 120));
});

test("opening balances behave like invoices: later payments settle them", async () => {
  const pay = await asAdmin(() => sales.recordPayment({ companyId: A._id, partyId: p.owes._id, amount: 5000, mode: "BANK" }));
  assert.deepEqual(pay.payment.allocations.map((a) => [a.invoiceNumber, a.amount]), [["Opening Balance", 5000]]);
  assert.equal((await asAdmin(() => sales.getBalance(A._id, p.owes._id))).balance, 0);
});
