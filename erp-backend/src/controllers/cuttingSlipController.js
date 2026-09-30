const mongoose = require("mongoose");
const CuttingSlip = require("../models/cuttingSlipModel");
const InventoryLedger = require("../models/inventoryLedgerModelV2");
const SkuV2 = require("../models/skuV2Model");
const WarehouseLocationV2 = require("../models/warehouseLocationV2Model");
const Sequence = require("../models/sequenceModel");
const PurchaseInvoiceV2 = require("../models/purchaseInvoiceV2Model");

const toObjectId = (id) => {
  if (!id) return null;
  if (mongoose.Types.ObjectId.isValid(id)) return new mongoose.Types.ObjectId(id);
  return null;
};

// Helper: resolve warehouse hierarchy for ledger
const getHierarchy = async (locId, companyId, session) => {
  if (!locId) return { warehouseId: null, floorId: null, zoneId: null, locationId: null };
  const loc = await WarehouseLocationV2.findById(locId).session(session || null);
  if (!loc) return { warehouseId: locId, floorId: locId, zoneId: locId, locationId: locId };

  const chain = [loc];
  let curr = loc;
  while (curr && curr.parentId) {
    let parent = await WarehouseLocationV2.findOne({ _id: curr.parentId, company: companyId }).session(session || null);
    if (!parent) parent = await WarehouseLocationV2.findById(curr.parentId).session(session || null);
    if (!parent) break;
    chain.unshift(parent);
    curr = parent;
  }
  const factoryNode = chain.find(n => n.level === "Factory");
  const floorNode = chain.find(n => n.level === "Floor");
  const zoneNode = chain.find(n => n.level === "Zone");
  const storageNode = chain.find(n => n.level === "Storage Location");

  const warehouseId = factoryNode ? factoryNode._id : (chain[0]?._id || loc._id);
  const floorId = floorNode ? floorNode._id : (chain[1]?._id || warehouseId);
  const zoneId = zoneNode ? zoneNode._id : (chain[2]?._id || floorId);
  const locationId = storageNode ? storageNode._id : loc._id;
  return { warehouseId, floorId, zoneId, locationId };
};

// Helper: Generate next slip number dynamically (CS-001, CS-002, ..., CS-999, CS-1000...)
const generateNextCuttingSlipNumber = async (companyId, session = null) => {
  const compId = toObjectId(companyId);
  const query = CuttingSlip.find({ company: compId }).select('slipNumber').lean();
  if (session) query.session(session);
  const slips = await query;

  let maxSeq = 0;
  for (const slip of slips) {
    if (!slip.slipNumber) continue;
    // Match CS-001, CS-999, CS-1000, and legacy CS-2026-0001
    const match = slip.slipNumber.match(/^CS-(?:(?:\d{4})-)?(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }

  let candidateSeq = maxSeq + 1;
  let padLen = Math.max(3, String(candidateSeq).length);
  let candidateNumber = `CS-${String(candidateSeq).padStart(padLen, '0')}`;

  // Collision safety check
  let checkQuery = CuttingSlip.findOne({ company: compId, slipNumber: candidateNumber });
  if (session) checkQuery.session(session);
  let exists = await checkQuery;
  while (exists) {
    candidateSeq++;
    padLen = Math.max(3, String(candidateSeq).length);
    candidateNumber = `CS-${String(candidateSeq).padStart(padLen, '0')}`;
    checkQuery = CuttingSlip.findOne({ company: compId, slipNumber: candidateNumber });
    if (session) checkQuery.session(session);
    exists = await checkQuery;
  }

  return candidateNumber;
};

// 1. Get next slip number (e.g. CS-001, CS-002, ... dynamically infinite)
exports.getNextSlipNumber = async (req, res) => {
  try {
    const companyId = req.companyId || req.query.companyId;
    if (!companyId) return res.status(400).json({ msg: "companyId is required" });

    const formatted = await generateNextCuttingSlipNumber(companyId);
    return res.json({ slipNumber: formatted });
  } catch (error) {
    console.error("Error generating cutting slip number:", error);
    return res.status(500).json({ msg: "Failed to generate slip number", error: error.message });
  }
};

// 2. Get available reels on-hand
exports.getAvailableReels = async (req, res) => {
  try {
    const companyId = toObjectId(req.companyId || req.query.companyId);
    if (!companyId) return res.status(400).json({ msg: "companyId is required" });

    // Step A: Find all reel SKUs
    const reelSkus = await SkuV2.find({
      company: companyId,
      isDeleted: false,
      $or: [
        { paperType: "Reels" },
        { category: { $regex: /reel/i } },
        { name: { $regex: /reel/i } }
      ]
    }).lean();

    const reelSkuIds = reelSkus.map(s => s._id);

    // Step B: Query InventoryLedger to find on-hand reels
    // Reels IN minus Reels OUT
    const ledgerAgg = await InventoryLedger.aggregate([
      {
        $match: {
          company: companyId,
          skuId: { $in: reelSkuIds },
          status: "Posted"
        }
      },
      {
        $group: {
          _id: { skuId: "$skuId", locationId: "$locationId", batchNumber: "$batchNumber" },
          qtyIn: { $sum: { $cond: [{ $eq: ["$direction", "IN"] }, "$quantity", 0] } },
          qtyOut: { $sum: { $cond: [{ $eq: ["$direction", "OUT"] }, "$quantity", 0] } },
          reelsIn: { $push: { $cond: [{ $eq: ["$direction", "IN"] }, "$reels", []] } },
          reelsOut: { $push: { $cond: [{ $eq: ["$direction", "OUT"] }, "$reels", []] } }
        }
      },
      {
        $project: {
          skuId: "$_id.skuId",
          locationId: "$_id.locationId",
          batchNumber: "$_id.batchNumber",
          onHandQty: { $subtract: ["$qtyIn", "$qtyOut"] },
          activeReels: {
            $filter: {
              input: {
                $reduce: {
                  input: "$reelsIn",
                  initialValue: [],
                  in: { $concatArrays: ["$$value", "$$this"] }
                }
              },
              as: "r",
              cond: {
                $not: {
                  $in: [
                    "$$r.reelNumber",
                    {
                      $reduce: {
                        input: "$reelsOut",
                        initialValue: [],
                        in: { $concatArrays: ["$$value", "$$this"] }
                      }
                    }
                  ]
                }
              }
            }
          }
        }
      },
      { $match: { onHandQty: { $gt: 0.1 } } }
    ]);

    // Lookup Locations
    const locationIds = [...new Set(ledgerAgg.map(l => String(l.locationId)))];
    const locations = await WarehouseLocationV2.find({ _id: { $in: locationIds.map(toObjectId) } }).lean();
    const locMap = new Map(locations.map(l => [String(l._id), l]));
    const skuMap = new Map(reelSkus.map(s => [String(s._id), s]));

    // Lookup Purchase Invoice item rates for purchase batches
    const batchNumbers = [...new Set(ledgerAgg.map(l => l.batchNumber).filter(Boolean))];
    const invoices = await PurchaseInvoiceV2.find({
      company: companyId,
      invoiceNumber: { $in: batchNumbers }
    }).lean();
    const invoiceItemMap = new Map();
    invoices.forEach(inv => {
      (inv.items || []).forEach(it => {
        const key = `${inv.invoiceNumber}_${String(it.skuId)}`;
        invoiceItemMap.set(key, it);
      });
    });

    const result = [];
    for (const group of ledgerAgg) {
      const sku = skuMap.get(String(group.skuId));
      const loc = locMap.get(String(group.locationId));
      const invItem = invoiceItemMap.get(`${group.batchNumber}_${String(group.skuId)}`);
      const rate = invItem?.ratePerKg || (invItem?.purchasePrice && invItem?.quantity ? invItem.purchasePrice / invItem.quantity : 0) || sku?.avgCost || sku?.purchasePrice || sku?.costPrice || 60;

      const activeReels = group.activeReels || [];
      if (activeReels.length > 0) {
        activeReels.forEach((r, idx) => {
          result.push({
            id: `${group.skuId}_${group.batchNumber}_${r.reelNumber || idx}`,
            reelNumber: r.reelNumber || `R-${idx + 1}`,
            weight: Number(r.weight) || (group.onHandQty / (activeReels.length || 1)),
            width: Number(r.width) || sku?.width || 0,
            gsm: Number(r.gsm) || sku?.gsm || 0,
            skuId: group.skuId,
            skuName: sku?.name || "Paper Reel",
            skuCode: sku?.skuCode || "",
            locationId: group.locationId,
            locationName: loc ? `${loc.code || loc.name} (${loc.level || 'Godown'})` : "Warehouse",
            purchaseBatch: group.batchNumber || "PB-OPEN",
            ratePerKg: rate
          });
        });
      } else {
        // If specific reel numbers were not logged, expose batch weight as virtual reels
        result.push({
          id: `${group.skuId}_${group.batchNumber}_lot`,
          reelNumber: `LOT-${group.batchNumber || 'STK'}`,
          weight: group.onHandQty,
          width: sku?.width || 0,
          gsm: sku?.gsm || 0,
          skuId: group.skuId,
          skuName: sku?.name || "Paper Reel",
          skuCode: sku?.skuCode || "",
          locationId: group.locationId,
          locationName: loc ? `${loc.code || loc.name}` : "Warehouse",
          purchaseBatch: group.batchNumber || "PB-OPEN",
          ratePerKg: rate
        });
      }
    }

    return res.json({ availableReels: result });
  } catch (error) {
    console.error("Error fetching available reels:", error);
    return res.status(500).json({ msg: "Failed to fetch available reels", error: error.message });
  }
};

// 3. Create and Post a Cutting Slip Voucher
exports.createCuttingSlip = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const companyId = toObjectId(req.companyId || req.body.companyId);
    if (!companyId) throw new Error("companyId is required");

    const {
      slipNumber: reqSlipNumber,
      date,
      sourceSku,
      purchaseBatch,
      sourceLocationId,
      selectedReels,
      totalInputWeight,
      inputRatePerKg,
      totalInputCost,
      targetSku,
      sheetWidth,
      sheetLength,
      sheetGsm,
      sheetsPerReam,
      theoreticalSheets,
      theoreticalReams,
      startMeterReading,
      endMeterReading,
      cutsCount,
      reelsOnStand,
      slitsCount,
      actualSheets,
      actualReams,
      varianceSheets,
      wastePercentage,
      scrapWeightKg,
      scrapRatePerKg,
      coreCount,
      coreRatePerPc,
      totalScrapCredit,
      netProductionCost,
      effectiveCostPerSheet,
      effectiveCostPerReam,
      destinationLocationId,
      machineName,
      operatorName,
      notes
    } = req.body;

    if (!sourceSku) throw new Error("Source paper reel SKU is required");
    if (!targetSku) throw new Error("Target converted sheet SKU is required");
    if (!destinationLocationId) throw new Error("Destination location is required");
    if (!totalInputWeight || totalInputWeight <= 0) throw new Error("Total input weight must be greater than zero");
    if (actualSheets === undefined || actualSheets < 0) throw new Error("Actual sheets produced cannot be negative");

    // Auto-generate slip number if missing
    let finalSlipNumber = reqSlipNumber;
    if (!finalSlipNumber) {
      finalSlipNumber = await generateNextCuttingSlipNumber(companyId, session);
    }

    // Check duplicate
    const existing = await CuttingSlip.findOne({ company: companyId, slipNumber: finalSlipNumber }).session(session);
    if (existing) throw new Error(`Cutting slip ${finalSlipNumber} already exists`);

    // Verify SKUs
    const sourceSkuDoc = await SkuV2.findById(sourceSku).session(session);
    if (!sourceSkuDoc) throw new Error("Source reel SKU not found");
    const targetSkuDoc = await SkuV2.findById(targetSku).session(session);
    if (!targetSkuDoc) throw new Error("Target sheet SKU not found");

    // Resolve Location Hierarchies
    const sourceH = await getHierarchy(sourceLocationId || selectedReels?.[0]?.locationId, companyId, session);
    const destH = await getHierarchy(destinationLocationId, companyId, session);

    // 1. Create Cutting Slip Document
    const cuttingSlip = new CuttingSlip({
      slipNumber: finalSlipNumber,
      company: companyId,
      date: date || new Date(),
      sourceSku: toObjectId(sourceSku),
      purchaseBatch: purchaseBatch || "",
      sourceLocationId: toObjectId(sourceLocationId || selectedReels?.[0]?.locationId),
      selectedReels: (selectedReels || []).map(r => ({
        reelNumber: r.reelNumber,
        weight: Number(r.weight),
        width: Number(r.width || 0),
        gsm: Number(r.gsm || 0),
        locationId: toObjectId(r.locationId)
      })),
      totalInputWeight: Number(totalInputWeight),
      inputRatePerKg: Number(inputRatePerKg || 0),
      totalInputCost: Number(totalInputCost || 0),
      targetSku: toObjectId(targetSku),
      sheetWidth: Number(sheetWidth),
      sheetLength: Number(sheetLength),
      sheetGsm: Number(sheetGsm),
      sheetsPerReam: Number(sheetsPerReam || 500),
      startMeterReading: Number(startMeterReading || 0),
      endMeterReading: Number(endMeterReading || 0),
      cutsCount: Number(cutsCount || 0),
      reelsOnStand: Number(reelsOnStand || selectedReels?.length || 1),
      slitsCount: Number(slitsCount || 1),
      theoreticalSheets: Number(theoreticalSheets),
      theoreticalReams: Number(theoreticalReams || 0),
      actualSheets: Number(actualSheets),
      actualReams: Number(actualReams || (actualSheets / (sheetsPerReam || 500))),
      varianceSheets: Number(varianceSheets || 0),
      wastePercentage: Number(wastePercentage || 0),
      scrapWeightKg: Number(scrapWeightKg || 0),
      scrapRatePerKg: Number(scrapRatePerKg || 0),
      coreCount: Number(coreCount || 0),
      coreRatePerPc: Number(coreRatePerPc || 0),
      totalScrapCredit: Number(totalScrapCredit || 0),
      netProductionCost: Number(netProductionCost || 0),
      effectiveCostPerSheet: Number(effectiveCostPerSheet || 0),
      effectiveCostPerReam: Number(effectiveCostPerReam || 0),
      destinationLocationId: toObjectId(destinationLocationId),
      machineName: machineName || "Sheeter 01",
      operatorName: operatorName || "",
      notes: notes || "",
      status: "Posted",
      createdBy: toObjectId(req.user?.id)
    });

    await cuttingSlip.save({ session });

    // 2. Inventory Ledger Entries (Tally Stock Journal Equivalent)
    // Entry A: OUT (Consumption of Reels)
    const txNumOut = await Sequence.getNextSequence("IL", session);
    const ledgerOut = new InventoryLedger({
      transactionNumber: txNumOut,
      transactionType: "Processing",
      skuId: toObjectId(sourceSku),
      quantity: Number(totalInputWeight),
      unit: sourceSkuDoc.unit || "kg",
      direction: "OUT",
      referenceType: "CuttingSlip",
      referenceId: finalSlipNumber,
      batchNumber: purchaseBatch || finalSlipNumber,
      warehouseId: sourceH.warehouseId,
      floorId: sourceH.floorId,
      zoneId: sourceH.zoneId,
      locationId: sourceH.locationId,
      reels: (selectedReels || []).map(r => ({
        reelNumber: r.reelNumber,
        weight: Number(r.weight),
        width: Number(r.width || 0),
        gsm: Number(r.gsm || 0)
      })),
      remarks: `Consumption of ${selectedReels?.length || 1} reels (${totalInputWeight} kg) for Cutting Slip ${finalSlipNumber}`,
      createdBy: toObjectId(req.user?.id),
      company: companyId,
      status: "Posted"
    });
    await ledgerOut.save({ session });

    // Entry B: IN (Generation of Converted Sheets)
    const isTargetUnitReam = (targetSkuDoc.unit || '').toLowerCase().includes('ream');
    const finalOutputQty = isTargetUnitReam ? Number(actualReams) : Number(actualSheets);

    const txNumIn = await Sequence.getNextSequence("IL", session);
    const ledgerIn = new InventoryLedger({
      transactionNumber: txNumIn,
      transactionType: "Processing",
      skuId: toObjectId(targetSku),
      quantity: finalOutputQty,
      unit: targetSkuDoc.unit || (isTargetUnitReam ? "Reams" : "Sheets"),
      direction: "IN",
      referenceType: "CuttingSlip",
      referenceId: finalSlipNumber,
      batchNumber: finalSlipNumber,
      warehouseId: destH.warehouseId,
      floorId: destH.floorId,
      zoneId: destH.zoneId,
      locationId: destH.locationId,
      remarks: `Output: ${actualSheets} Sheets (${actualReams} Reams) cut from reels via ${finalSlipNumber}`,
      createdBy: toObjectId(req.user?.id),
      company: companyId,
      status: "Posted"
    });
    await ledgerIn.save({ session });

    // Update target SKU's weighted average cost using standard formula:
    // New Avg Cost = (Existing Stock Value + New Production Value) / (Existing Qty + New Qty)
    try {
      const onHandAgg = await InventoryLedger.aggregate([
        {
          $match: {
            company: companyId,
            skuId: targetSkuDoc._id,
            status: "Posted"
          }
        },
        {
          $group: {
            _id: "$skuId",
            totalIn: { $sum: { $cond: [{ $eq: ["$direction", "IN"] }, "$quantity", 0] } },
            totalOut: { $sum: { $cond: [{ $eq: ["$direction", "OUT"] }, "$quantity", 0] } }
          }
        }
      ]).session(session);

      const rawOnHand = onHandAgg.length > 0 ? (onHandAgg[0].totalIn - onHandAgg[0].totalOut) : 0;
      const existingQty = Math.max(0, rawOnHand - finalOutputQty);
      const existingRate = Number(targetSkuDoc.avgCost || targetSkuDoc.costPrice || targetSkuDoc.standardCost || 0);
      const existingStockValue = existingQty * existingRate;

      const totalQty = existingQty + finalOutputQty;
      const unitRate = isTargetUnitReam ? Number(effectiveCostPerReam || 0) : Number(effectiveCostPerSheet || 0);
      const newProductionValue = Number(netProductionCost || (finalOutputQty * unitRate));

      const newAvgCost = totalQty > 0
        ? ((existingStockValue + newProductionValue) / totalQty)
        : unitRate;

      const roundedAvg = Math.round(newAvgCost * 10000) / 10000;
      targetSkuDoc.avgCost = roundedAvg;
      targetSkuDoc.costPrice = roundedAvg;
      targetSkuDoc.standardCost = roundedAvg;
      await targetSkuDoc.save({ session });
    } catch (costErr) {
      console.error("Non-critical: Failed to update target SKU weighted average cost on cutting slip:", costErr);
    }

    // Commit Transaction
    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      msg: "Cutting Slip posted successfully",
      cuttingSlip
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error creating cutting slip:", error);
    return res.status(400).json({ msg: error.message || "Failed to post cutting slip" });
  }
};

// 4. Get Cutting Slips History
exports.getCuttingSlips = async (req, res) => {
  try {
    const companyId = toObjectId(req.companyId || req.query.companyId);
    if (!companyId) return res.status(400).json({ msg: "companyId is required" });

    const { page = 1, limit = 50, search = "" } = req.query;
    const query = { company: companyId };

    if (search) {
      query.$or = [
        { slipNumber: { $regex: search, $options: "i" } },
        { purchaseBatch: { $regex: search, $options: "i" } },
        { operatorName: { $regex: search, $options: "i" } }
      ];
    }

    const total = await CuttingSlip.countDocuments(query);
    const cuttingSlips = await CuttingSlip.find(query)
      .populate("sourceSku", "name skuCode unit gsm width")
      .populate("targetSku", "name skuCode unit gsm width length")
      .populate("destinationLocationId", "name code level")
      .populate("sourceLocationId", "name code level")
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    return res.json({
      cuttingSlips,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Error fetching cutting slips:", error);
    return res.status(500).json({ msg: "Failed to fetch cutting slips", error: error.message });
  }
};

// 5. Cancel / Reverse a Cutting Slip
exports.cancelCuttingSlip = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const companyId = toObjectId(req.companyId || req.body.companyId);
    const { id } = req.params;

    const slip = await CuttingSlip.findOne({ _id: id, company: companyId }).session(session);
    if (!slip) throw new Error("Cutting slip not found");
    if (slip.status === "Cancelled") throw new Error("Cutting slip is already cancelled");

    // Remove the associated ledger entries
    await InventoryLedger.deleteMany({
      company: companyId,
      referenceType: "CuttingSlip",
      referenceId: slip.slipNumber
    }).session(session);

    slip.status = "Cancelled";
    await slip.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.json({ msg: "Cutting slip cancelled and stock reversed successfully" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error cancelling cutting slip:", error);
    return res.status(400).json({ msg: error.message || "Failed to cancel cutting slip" });
  }
};
