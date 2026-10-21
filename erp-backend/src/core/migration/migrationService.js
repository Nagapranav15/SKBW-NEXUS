/**
 * Migration of validated legacy data into the new ledgers. Nothing here modifies or deletes legacy data.
 *
 *  Stock    legacy live stock = InventoryLedger (status != Cancelled) summed IN - OUT per item and location,
 *           exactly what the Stock & Inventory screen shows. Each item/location with a positive quantity becomes
 *           one OPENING receipt in the new stock ledger.
 *  Parties  customers' outstanding balance becomes one OPENING item in the party ledger (settled by later payments).
 *           Legacy invoices before the cut-over are NOT migrated: that balance is already inside the opening figure.
 *
 * Cost has no single legacy field (eight exist). Candidates are listed per item; an item is migrated only when
 * the candidates agree (within 1%) or the caller explicitly accepts the conflict. Items with a negative
 * quantity, no cost, or a unit mismatch are reported and skipped until corrected.
 *
 * Every posting uses an idempotency key, so `apply` can be re-run safely and resumes where it stopped.
 */
const mongoose = require("mongoose");
const stock = require("../stock/stockService");
const { StockBalance, ItemCost } = require("../stock/models");
const sales = require("../sales/salesService");
const { PartyBalance } = require("../sales/models");
const { roundMoney, roundQty } = require("../stock/costing");

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const COST_FIELDS = ["avgCost", "avgRate", "purchasePrice", "ratePerKg", "costPrice", "standardCost", "rate", "valuationRate"];
const CONFLICT_TOLERANCE = 0.01;

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

/** Candidate costs from every legacy field, the chosen one, and whether they disagree. */
function resolveLegacyCost(sku) {
  const candidates = COST_FIELDS.map((f) => ({ field: f, value: num(sku[f]) })).filter((c) => c.value > 0);
  if (candidates.length === 0) return { unitCost: 0, source: null, candidates, conflict: false };
  const chosen = candidates[0]; // COST_FIELDS order is the priority order
  const conflict = candidates.some((c) => Math.abs(c.value - chosen.value) / chosen.value > CONFLICT_TOLERANCE);
  return { unitCost: chosen.value, source: chosen.field, candidates, conflict };
}

async function legacyStock(companyId) {
  const InventoryLedger = mongoose.model("InventoryLedger");
  const SkuV2 = mongoose.model("SkuV2");
  const rows = await InventoryLedger.aggregate([
    { $match: { company: oid(companyId), status: { $ne: "Cancelled" } } },
    {
      $group: {
        _id: { skuId: "$skuId", locationId: "$locationId" },
        qtyIn: { $sum: { $cond: [{ $eq: ["$direction", "IN"] }, "$quantity", 0] } },
        qtyOut: { $sum: { $cond: [{ $eq: ["$direction", "OUT"] }, "$quantity", 0] } },
        units: { $addToSet: "$unit" },
      },
    },
  ]);
  const skus = await SkuV2.find({ _id: { $in: [...new Set(rows.map((r) => String(r._id.skuId)))].map(oid) }, company: oid(companyId) }).lean();
  const skuById = new Map(skus.map((s) => [String(s._id), s]));

  const items = new Map();
  rows.forEach((r) => {
    const sku = skuById.get(String(r._id.skuId));
    if (!sku || sku.isDeleted) return; // orphaned or deleted items are not migrated
    const key = String(sku._id);
    if (!items.has(key)) {
      const cost = resolveLegacyCost(sku);
      items.set(key, { itemId: sku._id, skuCode: sku.skuCode, name: sku.name, unit: sku.unit || "", locations: [], units: new Set(), cost });
    }
    const it = items.get(key);
    it.locations.push({ locationId: r._id.locationId, qty: roundQty(r.qtyIn - r.qtyOut) });
    r.units.forEach((u) => it.units.add(u));
  });

  return [...items.values()].map((it) => {
    const totalQty = roundQty(it.locations.reduce((s, l) => s + l.qty, 0));
    const unitMismatch = [...it.units].some((u) => String(u || "").toLowerCase() !== String(it.unit).toLowerCase());
    const issues = [];
    if (it.locations.some((l) => l.qty < 0) || totalQty < 0) issues.push("NEGATIVE_STOCK");
    if (totalQty > 0 && !it.cost.unitCost) issues.push("NO_COST");
    if (it.cost.conflict) issues.push("COST_CONFLICT");
    if (unitMismatch) issues.push("UNIT_MISMATCH");
    return {
      itemId: String(it.itemId), skuCode: it.skuCode, name: it.name, unit: it.unit,
      locations: it.locations.map((l) => ({ locationId: l.locationId ? String(l.locationId) : null, qty: l.qty })),
      totalQty, unitCost: it.cost.unitCost, costSource: it.cost.source, costCandidates: it.cost.candidates,
      value: roundMoney(Math.max(0, totalQty) * it.cost.unitCost), issues,
    };
  }).sort((a, b) => a.skuCode.localeCompare(b.skuCode));
}

async function legacyParties(companyId, partyField) {
  const Party = mongoose.model("Party");
  const parties = await Party.find({ company: oid(companyId), type: "customer", isDeleted: { $ne: true } })
    .select("firmName ownerName outstanding outstandingBalance openingBalance creditLimit creditDays").lean();
  return parties.map((p) => {
    const a = num(p.outstandingBalance);
    const b = num(p.outstanding);
    const issues = [];
    if (a > 0 && b > 0 && Math.abs(a - b) > 0.005) issues.push("BALANCE_FIELDS_DIFFER");
    const amount = roundMoney(partyField === "outstanding" ? b : partyField === "outstandingBalance" ? a : a > 0 ? a : b);
    return { partyId: String(p._id), name: p.firmName || p.ownerName || "Customer", outstandingBalance: a, outstanding: b, amount, issues };
  }).filter((p) => p.amount > 0 || p.issues.length > 0);
}

/** Read-only: what would migrate, what would not and why. */
async function inspectCompany(companyId, { partyField = "auto" } = {}) {
  const [items, parties] = await Promise.all([legacyStock(companyId), legacyParties(companyId, partyField)]);
  const ok = (i) => i.totalQty > 0 && i.issues.length === 0;
  const migratable = items.filter(ok);
  const blocked = items.filter((i) => i.totalQty > 0 && i.issues.length > 0);
  const negative = items.filter((i) => i.issues.includes("NEGATIVE_STOCK"));

  const already = {
    stockEntries: await mongoose.model("StockLedger").countDocuments({ companyId: oid(companyId), referenceType: "MIGRATION" }),
    openingBalances: await mongoose.model("Receivable").countDocuments({ companyId: oid(companyId), invoiceId: /^OPENING:/ }),
  };
  return {
    companyId: String(companyId), generatedAt: new Date().toISOString(),
    stock: {
      itemsWithStock: items.filter((i) => i.totalQty > 0).length, migratable: migratable.length, blocked: blocked.length, negative: negative.length,
      quantityToMigrate: roundQty(migratable.reduce((s, i) => s + i.totalQty, 0)), valueToMigrate: roundMoney(migratable.reduce((s, i) => s + i.value, 0)),
      items,
    },
    parties: {
      customersOwing: parties.filter((p) => p.amount > 0).length, totalOutstanding: roundMoney(parties.reduce((s, p) => s + p.amount, 0)),
      withIssues: parties.filter((p) => p.issues.length > 0).length, parties,
    },
    alreadyMigrated: already,
  };
}

/**
 * Apply the migration. Returns a report; throws only on infrastructure failure.
 * @param {object} o { cutoverDate, partyField, only: 'stock'|'parties'|undefined, allowCostConflicts, userId }
 */
async function applyCompany(companyId, o = {}) {
  const inspected = await inspectCompany(companyId, { partyField: o.partyField || "auto" });
  const report = { companyId: String(companyId), startedAt: new Date().toISOString(), stock: { posted: [], skipped: [], failed: [] }, parties: { posted: [], skipped: [], failed: [] } };

  if (o.only !== "parties") {
    for (const item of inspected.stock.items) {
      if (!(item.totalQty > 0)) { if (item.issues.length) report.stock.skipped.push({ skuCode: item.skuCode, reason: item.issues.join(",") }); continue; }
      const blocking = item.issues.filter((i) => !(i === "COST_CONFLICT" && o.allowCostConflicts));
      if (blocking.length > 0) { report.stock.skipped.push({ skuCode: item.skuCode, reason: blocking.join(",") }); continue; }
      for (const loc of item.locations) {
        if (!(loc.qty > 0)) continue;
        try {
          const r = await stock.receive({
            companyId, itemId: item.itemId, locationId: loc.locationId, qty: loc.qty, unitCost: item.unitCost, txnType: "OPENING",
            referenceType: "MIGRATION", referenceId: "legacy-inventory-ledger", remarks: `Migrated opening stock (cost from ${item.costSource})`,
            idempotencyKey: `MIGRATE:STOCK:${companyId}:${item.itemId}:${loc.locationId || "none"}`, userId: o.userId,
          });
          report.stock.posted.push({ skuCode: item.skuCode, locationId: loc.locationId, qty: loc.qty, unitCost: item.unitCost, alreadyDone: r.duplicate });
        } catch (e) {
          report.stock.failed.push({ skuCode: item.skuCode, locationId: loc.locationId, error: e.message });
        }
      }
    }
  }

  if (o.only !== "stock") {
    for (const p of inspected.parties.parties) {
      if (!(p.amount > 0)) { if (p.issues.length) report.parties.skipped.push({ name: p.name, reason: p.issues.join(",") }); continue; }
      try {
        await sales.setOpeningBalance({ companyId, partyId: p.partyId, amount: p.amount, date: o.cutoverDate || new Date(), userId: o.userId });
        report.parties.posted.push({ name: p.name, partyId: p.partyId, amount: p.amount, flagged: p.issues });
      } catch (e) {
        if (e.code === "OPENING_EXISTS") report.parties.skipped.push({ name: p.name, reason: "ALREADY_MIGRATED" });
        else report.parties.failed.push({ name: p.name, error: e.message });
      }
    }
  }

  report.reconciliation = await reconcile(companyId, { partyField: o.partyField || "auto", only: o.only, allowCostConflicts: o.allowCostConflicts });
  report.finishedAt = new Date().toISOString();
  return report;
}

/** Compare the new ledgers with the legacy figures they were migrated from. */
async function reconcile(companyId, { partyField = "auto", only, allowCostConflicts } = {}) {
  const mismatches = [];
  const out = { stock: null, parties: null, ok: true, mismatches };

  if (only !== "parties") {
    const items = (await legacyStock(companyId)).filter((i) => i.totalQty > 0 && i.issues.filter((x) => !(x === "COST_CONFLICT" && allowCostConflicts)).length === 0);
    let legacyQty = 0, newQty = 0, legacyValue = 0, newValue = 0;
    for (const item of items) {
      const cost = await ItemCost.findOne({ companyId: oid(companyId), itemId: oid(item.itemId) }).lean();
      legacyQty += item.totalQty; legacyValue += item.value;
      newQty += cost ? cost.qty : 0; newValue += cost ? cost.value : 0;
      if (!cost || roundQty(cost.qty) !== roundQty(item.totalQty)) mismatches.push({ kind: "STOCK_QTY", skuCode: item.skuCode, legacy: item.totalQty, migrated: cost ? cost.qty : 0 });
      else if (Math.abs(cost.value - item.value) > 0.05 * Math.max(1, item.locations.length)) mismatches.push({ kind: "STOCK_VALUE", skuCode: item.skuCode, legacy: item.value, migrated: cost.value });
      for (const loc of item.locations.filter((l) => l.qty > 0)) {
        const bal = await StockBalance.findOne({ companyId: oid(companyId), itemId: oid(item.itemId), locationId: loc.locationId ? oid(loc.locationId) : null }).lean();
        if (!bal || roundQty(bal.qty) !== roundQty(loc.qty)) mismatches.push({ kind: "LOCATION_QTY", skuCode: item.skuCode, locationId: loc.locationId, legacy: loc.qty, migrated: bal ? bal.qty : 0 });
      }
    }
    out.stock = { items: items.length, legacyQty: roundQty(legacyQty), migratedQty: roundQty(newQty), legacyValue: roundMoney(legacyValue), migratedValue: roundMoney(newValue) };
  }

  if (only !== "stock") {
    const parties = (await legacyParties(companyId, partyField)).filter((p) => p.amount > 0);
    let legacyTotal = 0, newTotal = 0;
    for (const p of parties) {
      const b = await PartyBalance.findOne({ companyId: oid(companyId), partyId: oid(p.partyId) }).lean();
      legacyTotal += p.amount; newTotal += b ? b.balance : 0;
      if (!b || roundMoney(b.balance) !== roundMoney(p.amount)) mismatches.push({ kind: "PARTY_BALANCE", name: p.name, legacy: p.amount, migrated: b ? b.balance : 0 });
    }
    out.parties = { customers: parties.length, legacyOutstanding: roundMoney(legacyTotal), migratedBalance: roundMoney(newTotal) };
  }

  out.ok = mismatches.length === 0;
  return out;
}

module.exports = { resolveLegacyCost, inspectCompany, applyCompany, reconcile, COST_FIELDS };
