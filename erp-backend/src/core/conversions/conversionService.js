/**
 * Factory conversions: inputs are consumed and outputs are produced in ONE transaction, using the stock engine.
 *
 *   Input stock leaves at its moving-average cost (CONVERSION_OUT ledger entries).
 *   Net cost = input value + processing / job-work charges - scrap credit.
 *   Wastage is not credited: its cost is absorbed by the good output.
 *   Output stock enters at the allocated cost (CONVERSION_IN ledger entries); with several outputs the net cost
 *   is shared by `costShare` (default: quantity) and the last output takes the remainder, so the shares always
 *   add up to the net cost exactly.
 *   Every input/output keeps its ledger entry ID, and reels consumed or produced are linked, so the chain
 *   purchase -> reel -> conversion -> output is traceable.
 */
const mongoose = require("mongoose");
const { Conversion } = require("./models");
const { ensureCounter, nextNumber } = require("../counters");
const { Reel } = require("../stock/models");
const stock = require("../stock/stockService");
const { roundMoney, roundQty, roundRate } = require("../stock/costing");
const { computeSheeting } = require("./sheeting");

const { StockError } = stock;
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const isDuplicateKey = (e) => e && (e.code === 11000 || /E11000/.test(e.message || ""));

const PREFIX = { SHEETING: "CS", SLITTING: "SL", RULING: "RL", INDEX_PRINTING: "IP", COVER_PRINTING: "CP", BINDING: "BD" };

/** Take weight from specific reels. Atomic: a reel can never be consumed twice or below zero. */
async function consumeReels(companyId, itemId, reels, session) {
  const used = [];
  for (const r of reels) {
    const reel = await Reel.findOne({ _id: oid(r.reelId), companyId: oid(companyId) }).session(session);
    if (!reel) throw new StockError(`Reel not found: ${r.reelId}`, 404, "REEL_NOT_FOUND");
    if (String(reel.itemId) !== String(itemId)) throw new StockError(`Reel ${reel.reelNumber} is not of the selected item`, 400, "REEL_ITEM_MISMATCH");
    const take = roundQty(r.weightKg);
    if (!(take > 0)) throw new StockError(`Reel ${reel.reelNumber}: weight must be positive`, 400, "INVALID_WEIGHT");
    const left = roundQty(reel.remainingWeightKg - take);
    const res = await Reel.updateOne(
      { _id: reel._id, companyId: oid(companyId), status: "Available", remainingWeightKg: { $gte: take } },
      { $set: { remainingWeightKg: left, status: left <= 0 ? "Consumed" : "Available" } },
      { session },
    );
    if (res.modifiedCount !== 1) throw new StockError(`Reel ${reel.reelNumber} does not have ${take} kg available`, 409, "REEL_UNAVAILABLE", { remaining: reel.remainingWeightKg });
    used.push({ reelId: reel._id, reelNumber: reel.reelNumber, weightKg: take });
  }
  return used;
}

/**
 * @param {object} p  { companyId, type, date, inputs, outputs, charges, wastageQty, wastageNote, scrapCredit,
 *                      reference, operatorName, notes, idempotencyKey, userId, afterInputs }
 *  afterInputs(totalInputValue) may return { scrapCredit, sheeting } once the real input cost is known.
 */
async function postConversion(p) {
  if (!Array.isArray(p.inputs) || p.inputs.length === 0) throw new StockError("At least one input is required", 400, "NO_INPUTS");
  if (!Array.isArray(p.outputs) || p.outputs.length === 0) throw new StockError("At least one output is required", 400, "NO_OUTPUTS");
  const prefix = PREFIX[p.type];
  if (!prefix) throw new StockError("Unknown conversion type", 400, "INVALID_TYPE");
  const companyId = String(p.companyId);

  if (p.idempotencyKey) {
    const existing = await Conversion.findOne({ companyId: oid(companyId), idempotencyKey: p.idempotencyKey }).lean();
    if (existing) return { conversion: existing, duplicate: true };
  }

  // Validate items and make sure stock rows exist before the transaction starts
  const itemOf = new Map();
  for (const line of [...p.inputs, ...p.outputs]) {
    if (!itemOf.has(String(line.itemId))) itemOf.set(String(line.itemId), await stock.loadItem(companyId, line.itemId));
    if (!(line.qty > 0)) throw new StockError("Every quantity must be positive", 400, "INVALID_QUANTITY");
    await stock.ensureRows(companyId, line.itemId, [line.locationId]);
  }
  await ensureCounter(companyId, prefix);

  try {
    const conversion = await stock.withTransaction(async (session) => {
      const number = await nextNumber(companyId, prefix, session);
      const ref = { referenceType: "CONVERSION", referenceId: number };

      // 1. Consume inputs at the moving-average cost
      const inputs = [];
      for (const line of p.inputs) {
        const item = itemOf.get(String(line.itemId));
        let reels = [];
        if (Array.isArray(line.reels) && line.reels.length > 0) {
          reels = await consumeReels(companyId, line.itemId, line.reels, session);
          const sum = roundQty(reels.reduce((s, r) => s + r.weightKg, 0));
          if (sum !== roundQty(line.qty)) throw new StockError(`Reel weights (${sum}) must add up to the input quantity (${line.qty})`, 400, "REEL_WEIGHT_MISMATCH");
        }
        const mv = await stock.postMovement({
          companyId, itemId: line.itemId, locationId: line.locationId, direction: "OUT", txnType: "CONVERSION_OUT",
          qty: line.qty, unit: item.unit || "PCS", ...ref, remarks: `${p.type} input`, userId: p.userId,
        }, session);
        inputs.push({
          itemId: oid(line.itemId), locationId: line.locationId ? oid(line.locationId) : null, qty: roundQty(line.qty), unit: item.unit || "PCS",
          unitCost: mv.entry.unitCost, value: mv.entry.totalValue, reels, ledgerId: mv.entry._id,
        });
      }
      const totalInputValue = roundMoney(inputs.reduce((s, i) => s + i.value, 0));

      // 2. Costs
      const hook = p.afterInputs ? p.afterInputs(totalInputValue) || {} : {};
      const scrapCredit = roundMoney(hook.scrapCredit !== undefined ? hook.scrapCredit : p.scrapCredit || 0);
      const charges = (p.charges || []).map((c) => ({ kind: c.kind, description: c.description || "", vendorId: c.vendorId ? oid(c.vendorId) : null, amount: roundMoney(c.amount) }));
      const totalChargeValue = roundMoney(charges.reduce((s, c) => s + c.amount, 0));
      const netCost = roundMoney(totalInputValue + totalChargeValue - scrapCredit);
      if (netCost < 0) throw new StockError("Scrap credit cannot exceed the total cost", 400, "NEGATIVE_COST");

      // 3. Produce outputs at the allocated cost
      const shares = p.outputs.map((o) => (o.costShare > 0 ? o.costShare : o.qty));
      const shareTotal = shares.reduce((s, x) => s + x, 0);
      let allocated = 0;
      const outputs = [];
      for (let idx = 0; idx < p.outputs.length; idx++) {
        const line = p.outputs[idx];
        const item = itemOf.get(String(line.itemId));
        const isLast = idx === p.outputs.length - 1;
        const value = isLast ? roundMoney(netCost - allocated) : roundMoney((netCost * shares[idx]) / shareTotal);
        allocated = roundMoney(allocated + value);
        const mv = await stock.postMovement({
          companyId, itemId: line.itemId, locationId: line.locationId, direction: "IN", txnType: "CONVERSION_IN",
          qty: line.qty, totalValue: value, unit: item.unit || "PCS", ...ref, remarks: `${p.type} output`, userId: p.userId,
        }, session);
        let reelIds = [];
        if (Array.isArray(line.reels) && line.reels.length > 0) {
          const total = roundQty(line.reels.reduce((s, r) => s + r.weightKg, 0));
          if (total !== roundQty(line.qty)) throw new StockError(`Output reel weights (${total}) must add up to the output quantity (${line.qty})`, 400, "REEL_WEIGHT_MISMATCH");
          const perKg = total > 0 ? roundRate(value / total) : 0;
          const created = await Reel.create(line.reels.map((r) => ({
            companyId: oid(companyId), reelNumber: String(r.reelNumber).trim(), itemId: oid(line.itemId),
            gsm: r.gsm, widthCm: r.widthCm, initialWeightKg: roundQty(r.weightKg), remainingWeightKg: roundQty(r.weightKg),
            purchaseRef: number, locationId: line.locationId ? oid(line.locationId) : null, unitCostPerKg: perKg,
            receiptLedgerId: mv.entry._id, createdBy: p.userId ? oid(p.userId) : undefined,
          })), { session, ordered: true });
          reelIds = created.map((r) => r._id);
        }
        outputs.push({
          itemId: oid(line.itemId), locationId: line.locationId ? oid(line.locationId) : null, qty: roundQty(line.qty), unit: item.unit || "PCS",
          unitCost: mv.entry.unitCost, value: mv.entry.totalValue, ledgerId: mv.entry._id, reelIds,
        });
      }

      const [doc] = await Conversion.create([{
        companyId: oid(companyId), number, type: p.type, date: p.date || new Date(),
        inputs, outputs, charges, wastageQty: roundQty(p.wastageQty || 0), wastageNote: p.wastageNote || "",
        scrapCredit, totalInputValue, totalChargeValue, netCost,
        sheeting: hook.sheeting, reference: p.reference || "", operatorName: p.operatorName || "", notes: p.notes || "",
        idempotencyKey: p.idempotencyKey || undefined, createdBy: p.userId ? oid(p.userId) : undefined,
      }], { session });
      return doc.toObject();
    });
    return { conversion, duplicate: false };
  } catch (e) {
    if (isDuplicateKey(e) && /reelNumber/.test(e.message || "")) throw new StockError("One of the output reel numbers already exists", 409, "DUPLICATE_REEL");
    throw e;
  }
}

/** Reel -> sheets (the cutting slip). */
async function postSheeting(p) {
  if (!Array.isArray(p.reels) || p.reels.length === 0) throw new StockError("Select at least one reel", 400, "NO_REELS");
  const weightKg = roundQty(p.reels.reduce((s, r) => s + r.weightKg, 0));
  const sheet = p.sheet || {};
  const machine = p.machine || {};
  const scrap = p.scrap || {};

  // Validate the physics up front (impossible output is rejected before anything is posted)
  try {
    computeSheeting({ weightKg, widthCm: sheet.widthCm, lengthCm: sheet.lengthCm, gsm: sheet.gsm, sheetsPerReam: sheet.sheetsPerReam, reelsOnStand: machine.reelsOnStand, slitsCount: machine.slitsCount, cuts: machine.cuts, actualSheets: p.actualSheets, inputValue: 0 });
  } catch (e) {
    throw new StockError(e.message, 400, "INVALID_SHEETING");
  }

  const targetItem = await stock.loadItem(p.companyId, p.targetItemId);
  const outputInReams = /ream/i.test(targetItem.unit || "");
  const preview = computeSheeting({ weightKg, widthCm: sheet.widthCm, lengthCm: sheet.lengthCm, gsm: sheet.gsm, sheetsPerReam: sheet.sheetsPerReam, reelsOnStand: machine.reelsOnStand, slitsCount: machine.slitsCount, cuts: machine.cuts, actualSheets: p.actualSheets, inputValue: 0 });
  const outQty = outputInReams ? preview.actualReams : preview.actualSheets;
  if (!(outQty > 0)) throw new StockError("Actual sheets must be greater than zero", 400, "NO_OUTPUT");

  const additionalCosts = (p.additionalCosts || []).map((c) => ({ kind: c.kind || "PROCESSING", description: c.description || "", vendorId: c.vendorId, amount: c.amount }));

  return postConversion({
    ...p, type: "SHEETING",
    inputs: [{ itemId: p.reelItemId, locationId: p.sourceLocationId, qty: weightKg, reels: p.reels }],
    outputs: [{ itemId: p.targetItemId, locationId: p.destinationLocationId, qty: outQty }],
    charges: additionalCosts,
    afterInputs: (inputValue) => {
      const r = computeSheeting({
        weightKg, widthCm: sheet.widthCm, lengthCm: sheet.lengthCm, gsm: sheet.gsm, sheetsPerReam: sheet.sheetsPerReam,
        reelsOnStand: machine.reelsOnStand, slitsCount: machine.slitsCount, cuts: machine.cuts, actualSheets: p.actualSheets,
        scrapWeightKg: scrap.weightKg, scrapRatePerKg: scrap.ratePerKg, coreCount: scrap.coreCount, coreRatePerPc: scrap.coreRatePerPc,
        additionalCosts: additionalCosts, inputValue,
      });
      return {
        scrapCredit: r.scrapCredit,
        sheeting: {
          widthCm: sheet.widthCm, lengthCm: sheet.lengthCm, gsm: sheet.gsm, sheetsPerReam: r.sheetsPerReam,
          reelsOnStand: machine.reelsOnStand || 1, slitsCount: machine.slitsCount || 1, cuts: machine.cuts || 0,
          startMeter: machine.startMeter, endMeter: machine.endMeter,
          theoreticalSheets: r.theoreticalSheets, theoreticalReams: r.theoreticalReams, actualSheets: r.actualSheets, actualReams: r.actualReams,
          varianceSheets: r.varianceSheets, wastePercentage: r.wastePercentage,
          scrapWeightKg: scrap.weightKg || 0, scrapRatePerKg: scrap.ratePerKg || 0, coreCount: scrap.coreCount || 0, coreRatePerPc: scrap.coreRatePerPc || 0,
          costPerSheet: r.costPerSheet, costPerReam: r.costPerReam, costPer4Up: r.costPer4Up, machineName: p.machineName,
        },
      };
    },
  });
}

/**
 * What a sheeting would produce and cost, WITHOUT posting anything. The input value is an estimate
 * (weight x current moving average); the real figure is fixed when the conversion is posted.
 */
async function previewSheeting(p) {
  const sheet = p.sheet || {};
  const machine = p.machine || {};
  const scrap = p.scrap || {};
  let weightKg = 0;
  if (Array.isArray(p.reels) && p.reels.length > 0) {
    const reels = await Reel.find({ _id: { $in: p.reels.map((r) => oid(r.reelId)) }, companyId: oid(p.companyId) }).lean();
    if (reels.length !== new Set(p.reels.map((r) => String(r.reelId))).size) throw new StockError("One or more reels were not found", 404, "REEL_NOT_FOUND");
    weightKg = roundQty(p.reels.reduce((s, r) => s + r.weightKg, 0));
    const over = p.reels.find((r) => r.weightKg > (reels.find((x) => String(x._id) === String(r.reelId)) || {}).remainingWeightKg + 1e-9);
    if (over) throw new StockError("A reel does not have that much weight left", 409, "REEL_UNAVAILABLE");
  }
  const avg = await stock.getItemCost(p.companyId, p.reelItemId);
  const additionalCosts = (p.additionalCosts || []).map((c) => ({ amount: c.amount }));
  try {
    const r = computeSheeting({
      weightKg, widthCm: sheet.widthCm, lengthCm: sheet.lengthCm, gsm: sheet.gsm, sheetsPerReam: sheet.sheetsPerReam,
      reelsOnStand: machine.reelsOnStand, slitsCount: machine.slitsCount, cuts: machine.cuts, actualSheets: p.actualSheets,
      scrapWeightKg: scrap.weightKg, scrapRatePerKg: scrap.ratePerKg, coreCount: scrap.coreCount, coreRatePerPc: scrap.coreRatePerPc,
      additionalCosts, inputValue: roundMoney(weightKg * (avg.qty > 0 ? avg.value / avg.qty : 0)),
    });
    return { ...r, weightKg, estimatedAvgCostPerKg: avg.avgCost, isEstimate: true };
  } catch (e) {
    if (e instanceof RangeError) throw new StockError(e.message, 400, "INVALID_SHEETING");
    throw e;
  }
}

async function getConversion(companyId, id) {
  const doc = await Conversion.findOne({ _id: oid(id), companyId: oid(companyId) }).lean();
  if (!doc) throw new StockError("Conversion not found", 404, "NOT_FOUND");
  return doc;
}

async function listConversions(companyId, { type, page = 1, limit = 50 } = {}) {
  const filter = { companyId: oid(companyId), ...(type ? { type } : {}) };
  const size = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * size;
  const [rows, total] = await Promise.all([Conversion.find(filter).sort({ date: -1, _id: -1 }).skip(skip).limit(size).lean(), Conversion.countDocuments(filter)]);
  return { rows, total };
}

module.exports = { postConversion, postSheeting, previewSheeting, getConversion, listConversions };
