/**
 * Stock engine: the only code that changes stock quantity or value in the new core.
 *
 * Every movement is posted inside one MongoDB transaction that writes, together:
 *   1. an append-only StockLedger entry,
 *   2. the item's company-wide ItemCost (quantity, value, moving-average cost),
 *   3. the StockBalance for the location.
 * If any step fails the whole movement rolls back; there are no half-posted movements.
 */
const mongoose = require("mongoose");
const { StockLedger, ItemCost, StockBalance, Reel } = require("./models");
const { applyReceipt, applyIssue, roundQty, roundMoney, roundRate } = require("./costing");

class StockError extends Error {
  constructor(message, status = 400, code = "STOCK_ERROR", details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const isDuplicateKey = (e) => e && (e.code === 11000 || /E11000/.test(e.message || ""));

async function withTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await fn(session); });
    return result;
  } finally {
    await session.endSession();
  }
}

/** The item must exist and belong to the company (never trust an item ID on its own). */
async function loadItem(companyId, itemId, session) {
  const SkuV2 = mongoose.model("SkuV2");
  const item = await SkuV2.findOne({ _id: oid(itemId), company: oid(companyId) }).select("name skuCode unit").session(session || null).lean();
  if (!item) throw new StockError("Item not found for this company", 404, "ITEM_NOT_FOUND");
  return item;
}

/** Create the per-item / per-location rows outside the transaction so in-transaction work only updates. */
async function ensureRows(companyId, itemId, locationIds) {
  const tolerate = (p) => p.catch((e) => { if (!isDuplicateKey(e)) throw e; });
  await tolerate(ItemCost.updateOne({ companyId: oid(companyId), itemId: oid(itemId) }, { $setOnInsert: { qty: 0, value: 0, avgCost: 0 } }, { upsert: true }));
  for (const loc of locationIds) {
    await tolerate(StockBalance.updateOne(
      { companyId: oid(companyId), itemId: oid(itemId), locationId: loc ? oid(loc) : null },
      { $setOnInsert: { qty: 0 } },
      { upsert: true },
    ));
  }
}

/**
 * Post one movement inside an existing transaction.
 * @returns {{ entry: object, duplicate: boolean, itemState: {qty:number,value:number,avgCost:number} }}
 */
async function postMovement(m, session) {
  const companyId = oid(m.companyId);
  const itemId = oid(m.itemId);
  const locationId = m.locationId ? oid(m.locationId) : null;

  if (m.idempotencyKey) {
    const existing = await StockLedger.findOne({ companyId, idempotencyKey: m.idempotencyKey }).session(session).lean();
    if (existing) return { entry: existing, duplicate: true, itemState: { qty: existing.runningQty, value: existing.runningValue, avgCost: existing.avgCost } };
  }

  const cost = await ItemCost.findOne({ companyId, itemId }).session(session);
  if (!cost) throw new StockError("Stock rows were not initialised for this item", 500, "NOT_INITIALISED");
  const state = { qty: cost.qty, value: cost.value };

  let next, unitCost, totalValue, qtyIn = 0, qtyOut = 0;
  if (m.direction === "IN") {
    const r = applyReceipt(state, { qty: m.qty, unitCost: m.unitCost, totalValue: m.totalValue });
    next = r;
    totalValue = r.receiptValue;
    unitCost = roundRate(totalValue / m.qty);
    qtyIn = roundQty(m.qty);
  } else {
    if (!cost.allowNegative) {
      if (roundQty(m.qty) > roundQty(state.qty)) {
        throw new StockError(`Insufficient stock: ${state.qty} available, ${m.qty} requested`, 409, "INSUFFICIENT_STOCK", { available: state.qty, requested: m.qty });
      }
      const bal = await StockBalance.findOne({ companyId, itemId, locationId }).session(session).lean();
      const atLocation = bal ? bal.qty : 0;
      if (roundQty(m.qty) > roundQty(atLocation)) {
        throw new StockError(`Insufficient stock at this location: ${atLocation} available, ${m.qty} requested`, 409, "INSUFFICIENT_STOCK_AT_LOCATION", { available: atLocation, requested: m.qty });
      }
    }
    const r = applyIssue(state, { qty: m.qty });
    next = r;
    totalValue = r.issueValue;
    unitCost = r.issueUnitCost;
    qtyOut = roundQty(m.qty);
  }

  await ItemCost.updateOne({ _id: cost._id }, { $set: { qty: next.qty, value: next.value, avgCost: next.avgCost } }, { session });
  await StockBalance.updateOne(
    { companyId, itemId, locationId },
    { $inc: { qty: m.direction === "IN" ? qtyIn : -qtyOut } },
    { session },
  );

  const [entry] = await StockLedger.create([{
    companyId, itemId, locationId,
    txnType: m.txnType,
    direction: m.direction,
    referenceType: m.referenceType || "",
    referenceId: m.referenceId ? String(m.referenceId) : "",
    qtyIn, qtyOut,
    unit: m.unit,
    unitCost, totalValue,
    runningQty: next.qty, runningValue: next.value, avgCost: next.avgCost,
    reelId: m.reelId || null,
    remarks: m.remarks || "",
    idempotencyKey: m.idempotencyKey || undefined,
    createdBy: m.userId ? oid(m.userId) : undefined,
  }], { session });

  return { entry: entry.toObject(), duplicate: false, itemState: { qty: next.qty, value: next.value, avgCost: next.avgCost } };
}

const requireQty = (qty) => {
  if (typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0) throw new StockError("Quantity must be a positive number", 400, "INVALID_QUANTITY");
};

/** Stock coming in (purchase receipt, opening stock, return). Cost comes from unitCost or totalValue. */
async function receive(p) {
  requireQty(p.qty);
  const item = await loadItem(p.companyId, p.itemId);
  await ensureRows(p.companyId, p.itemId, [p.locationId]);
  return withTransaction((session) => postMovement({
    ...p, direction: "IN", txnType: p.txnType || "RECEIPT", unit: p.unit || item.unit || "PCS",
  }, session));
}

/** Stock going out (consumption, sale). Valued at the current moving average. */
async function issue(p) {
  requireQty(p.qty);
  const item = await loadItem(p.companyId, p.itemId);
  await ensureRows(p.companyId, p.itemId, [p.locationId]);
  return withTransaction((session) => postMovement({
    ...p, direction: "OUT", txnType: p.txnType || "ISSUE", unit: p.unit || item.unit || "PCS",
  }, session));
}

/** Manual correction; a reason is mandatory and the action is audited. */
async function adjust(p) {
  requireQty(p.qty);
  if (!p.reason || !String(p.reason).trim()) throw new StockError("A reason is required for a stock adjustment", 400, "REASON_REQUIRED");
  const item = await loadItem(p.companyId, p.itemId);
  await ensureRows(p.companyId, p.itemId, [p.locationId]);
  const result = await withTransaction(async (session) => {
    let params = { ...p, unit: item.unit || "PCS", remarks: `${p.reason}${p.remarks ? ` | ${p.remarks}` : ""}` };
    if (p.direction === "IN") {
      let unitCost = p.unitCost;
      if (unitCost === undefined && p.totalValue === undefined) {
        const cost = await ItemCost.findOne({ companyId: oid(p.companyId), itemId: oid(p.itemId) }).session(session).lean();
        unitCost = cost ? cost.avgCost : 0; // found stock is valued at the current average unless a cost is given
      }
      params = { ...params, direction: "IN", txnType: "ADJUSTMENT_IN", unitCost };
    } else {
      params = { ...params, direction: "OUT", txnType: "ADJUSTMENT_OUT" };
    }
    return postMovement(params, session);
  });
  await audit(p, "STOCK_ADJUSTMENT", `${p.direction === "IN" ? "+" : "-"}${p.qty} ${item.unit || ""} of ${item.skuCode || item.name}: ${p.reason}`, item);
  return result;
}

/** Move stock between locations. Total quantity, value and average cost do not change. */
async function transfer(p) {
  requireQty(p.qty);
  if (!p.fromLocationId || !p.toLocationId) throw new StockError("Both locations are required", 400, "LOCATION_REQUIRED");
  if (String(p.fromLocationId) === String(p.toLocationId)) throw new StockError("Source and destination must differ", 400, "SAME_LOCATION");
  const item = await loadItem(p.companyId, p.itemId);
  await ensureRows(p.companyId, p.itemId, [p.fromLocationId, p.toLocationId]);
  return withTransaction(async (session) => {
    const base = { companyId: p.companyId, itemId: p.itemId, qty: p.qty, unit: item.unit || "PCS", referenceType: p.referenceType, referenceId: p.referenceId, remarks: p.remarks, userId: p.userId };
    const out = await postMovement({ ...base, direction: "OUT", txnType: "TRANSFER_OUT", locationId: p.fromLocationId, idempotencyKey: p.idempotencyKey ? `${p.idempotencyKey}:out` : undefined }, session);
    const inn = await postMovement({ ...base, direction: "IN", txnType: "TRANSFER_IN", locationId: p.toLocationId, totalValue: out.entry.totalValue, idempotencyKey: p.idempotencyKey ? `${p.idempotencyKey}:in` : undefined }, session);
    return { out: out.entry, in: inn.entry, duplicate: out.duplicate && inn.duplicate };
  });
}

/**
 * Receive paper reels from a purchase: one stock receipt for the total weight plus one traceable Reel
 * record per reel, all in one transaction. Cost is `ratePerKg` or `totalCost`.
 */
async function receiveReels(p) {
  if (!Array.isArray(p.reels) || p.reels.length === 0) throw new StockError("At least one reel is required", 400, "NO_REELS");
  const item = await loadItem(p.companyId, p.itemId);
  if (!/kg/i.test(item.unit || "")) throw new StockError("Reels can only be received for items stocked in KG", 400, "ITEM_NOT_IN_KG");
  p.reels.forEach((r) => {
    if (!r.reelNumber || !String(r.reelNumber).trim()) throw new StockError("Every reel needs a reel number", 400, "REEL_NUMBER_REQUIRED");
    if (typeof r.weightKg !== "number" || !(r.weightKg > 0)) throw new StockError(`Reel ${r.reelNumber}: weight must be positive`, 400, "INVALID_WEIGHT");
  });
  const numbers = p.reels.map((r) => String(r.reelNumber).trim());
  if (new Set(numbers).size !== numbers.length) throw new StockError("Duplicate reel numbers in this receipt", 400, "DUPLICATE_REEL");

  const totalWeight = roundQty(p.reels.reduce((s, r) => s + r.weightKg, 0));
  const totalValue = p.totalCost !== undefined ? roundMoney(p.totalCost) : roundMoney(totalWeight * (p.ratePerKg || 0));
  if (p.totalCost === undefined && !(p.ratePerKg >= 0)) throw new StockError("ratePerKg or totalCost is required", 400, "COST_REQUIRED");
  const ratePerKg = totalWeight > 0 ? roundRate(totalValue / totalWeight) : 0;

  await ensureRows(p.companyId, p.itemId, [p.locationId]);
  try {
    return await withTransaction(async (session) => {
      const movement = await postMovement({
        companyId: p.companyId, itemId: p.itemId, locationId: p.locationId,
        direction: "IN", txnType: "RECEIPT", qty: totalWeight, totalValue, unit: item.unit,
        referenceType: "PURCHASE", referenceId: p.purchaseRef || "", remarks: `Reel receipt (${p.reels.length} reels)`,
        idempotencyKey: p.idempotencyKey, userId: p.userId,
      }, session);
      if (movement.duplicate) return { ...movement, reels: await Reel.find({ companyId: oid(p.companyId), receiptLedgerId: movement.entry._id }).session(session).lean() };

      const reels = await Reel.create(p.reels.map((r) => ({
        companyId: oid(p.companyId),
        reelNumber: String(r.reelNumber).trim(),
        itemId: oid(p.itemId),
        gsm: r.gsm, widthCm: r.widthCm,
        initialWeightKg: roundQty(r.weightKg), remainingWeightKg: roundQty(r.weightKg),
        supplierId: p.supplierId ? oid(p.supplierId) : null,
        purchaseRef: p.purchaseRef || "",
        locationId: p.locationId ? oid(p.locationId) : null,
        unitCostPerKg: ratePerKg,
        receiptLedgerId: movement.entry._id,
        createdBy: p.userId ? oid(p.userId) : undefined,
      })), { session, ordered: true });
      return { ...movement, reels: reels.map((r) => r.toObject()) };
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw new StockError("One of these reel numbers already exists", 409, "DUPLICATE_REEL");
    throw e;
  }
}

async function audit(p, action, details, item) {
  try {
    const ActivityLog = require("../../models/activityLogModel");
    await ActivityLog.create({
      action, entityType: "StockLedger", entityName: item.skuCode || item.name || String(p.itemId),
      details, performedBy: p.userName || "System", company: oid(p.companyId),
    });
  } catch (err) {
    console.error("Stock audit log failed:", err.message);
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────

async function getItemCost(companyId, itemId) {
  const c = await ItemCost.findOne({ companyId: oid(companyId), itemId: oid(itemId) }).lean();
  return c || { qty: 0, value: 0, avgCost: 0 };
}

async function getBalances(companyId, { itemId } = {}) {
  const filter = { companyId: oid(companyId), ...(itemId ? { itemId: oid(itemId) } : {}) };
  return StockBalance.find(filter).lean();
}

async function getLedger(companyId, { itemId, txnType, from, to, referenceType, referenceId, page = 1, limit = 100 } = {}) {
  const filter = { companyId: oid(companyId) };
  if (itemId) filter.itemId = oid(itemId);
  if (txnType) filter.txnType = txnType;
  if (referenceType) filter.referenceType = referenceType;
  if (referenceId) filter.referenceId = String(referenceId);
  if (from || to) filter.createdAt = { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(to) } : {}) };
  const size = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * size;
  const [rows, total] = await Promise.all([
    StockLedger.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(size).lean(),
    StockLedger.countDocuments(filter),
  ]);
  return { rows, total, page: Math.floor(skip / size) + 1, limit: size };
}

/** Stock valuation: quantity, value and average cost per item plus the company total. */
async function getValuation(companyId) {
  const rows = await ItemCost.find({ companyId: oid(companyId), $or: [{ qty: { $ne: 0 } }, { value: { $ne: 0 } }] }).lean();
  const SkuV2 = mongoose.model("SkuV2");
  const items = await SkuV2.find({ _id: { $in: rows.map((r) => r.itemId) }, company: oid(companyId) }).select("name skuCode unit").lean();
  const byId = new Map(items.map((i) => [String(i._id), i]));
  const lines = rows.map((r) => {
    const it = byId.get(String(r.itemId)) || {};
    return { itemId: r.itemId, skuCode: it.skuCode, name: it.name, unit: it.unit, qty: r.qty, value: r.value, avgCost: r.avgCost };
  });
  return { lines, totalValue: roundMoney(lines.reduce((s, l) => s + l.value, 0)) };
}

/** Integrity check: the item's stored state must equal what the ledger says. */
async function reconcile(companyId, itemId) {
  const [agg] = await StockLedger.aggregate([
    { $match: { companyId: oid(companyId), itemId: oid(itemId) } },
    { $group: { _id: null, qtyIn: { $sum: "$qtyIn" }, qtyOut: { $sum: "$qtyOut" } } },
  ]);
  const last = await StockLedger.findOne({ companyId: oid(companyId), itemId: oid(itemId) }).sort({ createdAt: -1, _id: -1 }).lean();
  const cost = await getItemCost(companyId, itemId);
  const ledgerQty = roundQty((agg ? agg.qtyIn : 0) - (agg ? agg.qtyOut : 0));
  const balances = await getBalances(companyId, { itemId });
  const balanceQty = roundQty(balances.reduce((s, b) => s + b.qty, 0));
  const ok = ledgerQty === roundQty(cost.qty) && balanceQty === ledgerQty && (!last || (last.runningQty === cost.qty && last.runningValue === cost.value));
  return { ok, ledgerQty, itemCostQty: cost.qty, balanceQty, itemCostValue: cost.value, lastRunningValue: last ? last.runningValue : 0 };
}

module.exports = { StockError, postMovement, withTransaction, ensureRows, loadItem, receive, issue, adjust, transfer, receiveReels, getItemCost, getBalances, getLedger, getValuation, reconcile };
