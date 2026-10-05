const mongoose = require("mongoose");
const CuttingSlip = require("../models/cuttingSlipModel");
const InventoryLedger = require("../models/inventoryLedgerModelV2");
const InventoryLedgerV2 = require("../models/inventoryLedgerV2Model");
const SkuV2 = require("../models/skuV2Model");
const WarehouseLocationV2 = require("../models/warehouseLocationV2Model");
const Sequence = require("../models/sequenceModel");
const PurchaseInvoiceV2 = require("../models/purchaseInvoiceV2Model");
const { getNextSequenceNumber } = require("../utils/sequenceManager");
const { broadcast } = require("../utils/realtimeService");

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

// Helper: Generate next slip number dynamically (CS-0001, CS-0002... via global sequenceManager)
const generateNextCuttingSlipNumber = async (companyId, session = null) => {
  return await getNextSequenceNumber("CS", companyId);
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

    // Step B: Query ALL already cut / consumed reels from posted Cutting Slips and InventoryLedger
    const postedSlips = await CuttingSlip.find({
      company: companyId,
      status: "Posted"
    }).select("sourceSku purchaseBatch selectedReels").lean();

    const cutReelNumbers = new Set();
    const cutReelKeys = new Set();

    for (const slip of postedSlips) {
      const skuIdStr = String(slip.sourceSku || '');
      const batchStr = String(slip.purchaseBatch || '').trim().toLowerCase();
      for (const r of (slip.selectedReels || [])) {
        if (r && r.reelNumber) {
          const num = String(r.reelNumber).trim().toLowerCase();
          cutReelNumbers.add(num);
          if (skuIdStr) {
            cutReelKeys.add(`${skuIdStr}_${num}`);
            if (batchStr) {
              cutReelKeys.add(`${skuIdStr}_${batchStr}_${num}`);
            }
          }
          if (batchStr) {
            cutReelKeys.add(`${batchStr}_${num}`);
          }
        }
      }
    }

    const ledgerOuts = await InventoryLedger.find({
      company: companyId,
      direction: "OUT",
      status: "Posted",
      "reels.0": { $exists: true }
    }).select("skuId batchNumber reels").lean();

    for (const entry of ledgerOuts) {
      const skuIdStr = String(entry.skuId || '');
      const batchStr = String(entry.batchNumber || '').trim().toLowerCase();
      for (const r of (entry.reels || [])) {
        if (r && r.reelNumber) {
          const num = String(r.reelNumber).trim().toLowerCase();
          cutReelNumbers.add(num);
          if (skuIdStr) {
            cutReelKeys.add(`${skuIdStr}_${num}`);
            if (batchStr) {
              cutReelKeys.add(`${skuIdStr}_${batchStr}_${num}`);
            }
          }
        }
      }
    }

    // Step C: Query InventoryLedger to find on-hand reels
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
          allReelsIn: {
            $reduce: {
              input: "$reelsIn",
              initialValue: [],
              in: { $concatArrays: ["$$value", "$$this"] }
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
    const seenReelIds = new Set();

    for (const group of ledgerAgg) {
      const sku = skuMap.get(String(group.skuId));
      const loc = locMap.get(String(group.locationId));
      const invItem = invoiceItemMap.get(`${group.batchNumber}_${String(group.skuId)}`);
      const rate = Number(
        invItem?.ratePerKg ||
        invItem?.purchasePrice ||
        (invItem?.totalPrice && invItem?.quantity ? invItem.totalPrice / invItem.quantity : 0) ||
        sku?.avgCost ||
        sku?.purchasePrice ||
        sku?.costPrice ||
        sku?.rate ||
        80
      );

      const allReels = group.allReelsIn || [];
      // Filter out any reel that has been cut or consumed
      const activeReels = allReels.filter(r => {
        if (!r || !r.reelNumber) return false;
        const cleanNum = String(r.reelNumber).trim().toLowerCase();
        const skuIdStr = String(group.skuId || '');
        const batchStr = String(group.batchNumber || '').trim().toLowerCase();

        if (cutReelNumbers.has(cleanNum)) return false;
        if (cutReelKeys.has(`${skuIdStr}_${cleanNum}`)) return false;
        if (cutReelKeys.has(`${skuIdStr}_${batchStr}_${cleanNum}`)) return false;
        if (cutReelKeys.has(`${batchStr}_${cleanNum}`)) return false;
        return true;
      });

      if (activeReels.length > 0) {
        activeReels.forEach((r, idx) => {
          const uniqueId = `${group.skuId}_${group.batchNumber || 'batch'}_${r.reelNumber || idx}`;
          if (seenReelIds.has(uniqueId)) return;
          seenReelIds.add(uniqueId);

          result.push({
            id: uniqueId,
            reelNumber: r.reelNumber || `R-${idx + 1}`,
            weight: Number(r.weight) || (group.onHandQty / activeReels.length),
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
      } else if (allReels.length === 0 && group.onHandQty > 0.1) {
        // Only if no explicit reels were defined in the batch, expose as lot
        const uniqueId = `${group.skuId}_${group.batchNumber || 'lot'}_lot`;
        if (!seenReelIds.has(uniqueId)) {
          seenReelIds.add(uniqueId);
          result.push({
            id: uniqueId,
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
    } else {
      const existing = await CuttingSlip.findOne({ company: companyId, slipNumber: finalSlipNumber }).session(session);
      if (existing) {
        finalSlipNumber = await generateNextCuttingSlipNumber(companyId, session);
      }
    }

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
      scrapWeightKg: 0,
      scrapRatePerKg: 0,
      coreCount: 0,
      coreRatePerPc: 0,
      totalScrapCredit: 0,
      netProductionCost: Number(totalInputCost || 0),
      effectiveCostPerSheet: Number(actualSheets) > 0 ? Number(totalInputCost || 0) / Number(actualSheets) : 0,
      effectiveCostPerReam: Number(actualReams) > 0 ? Number(totalInputCost || 0) / Number(actualReams) : 0,
      costPer4UpPiece: Number(actualSheets) > 0 ? Number((Number(totalInputCost || 0) / Number(actualSheets) / 4).toFixed(4)) : 0,
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

    // Secondary Ledger V2 OUT
    const ledgerOutV2 = new InventoryLedgerV2({
      transactionType: "Processing Consumption",
      referenceId: finalSlipNumber,
      skuId: toObjectId(sourceSku),
      locationId: sourceH.locationId,
      qtyIn: 0,
      qtyOut: Number(totalInputWeight),
      balanceAfter: 0,
      batchNumber: purchaseBatch || finalSlipNumber,
      reels: (selectedReels || []).map(r => ({
        reelNumber: r.reelNumber,
        weight: Number(r.weight),
        width: Number(r.width || 0),
        gsm: Number(r.gsm || 0)
      })),
      remarks: `Cutting slip ${finalSlipNumber} reel consumption`,
      company: companyId,
      userId: toObjectId(req.user?.id)
    });
    await ledgerOutV2.save({ session });

    // Entry B: IN (Generation of Converted Sheets / Semi-Finished Units)
    const targetUnitNorm = (targetSkuDoc.unit || '').trim().toLowerCase();
    const isTargetUnitReam = targetUnitNorm.includes('ream');
    const isTargetUnitPcs = targetUnitNorm === 'pcs' || targetUnitNorm === 'piece' || targetUnitNorm === 'pieces';
    const isTargetUnitGbl = targetUnitNorm === 'gbl';
    const convFactor = Number(targetSkuDoc.altUnitConversion || targetSkuDoc.conv || targetSkuDoc.booksGbl || targetSkuDoc.pcsPerGbl || 400);

    let finalOutputQty = Number(actualSheets);
    let unitRate = Number(actualSheets) > 0 ? Number(totalInputCost || 0) / Number(actualSheets) : 0;

    if (isTargetUnitReam) {
      finalOutputQty = Number(actualReams);
      unitRate = Number(actualReams) > 0 ? Number(totalInputCost || 0) / Number(actualReams) : 0;
    } else if (isTargetUnitPcs) {
      // 4-UP: 1 parent sheet yields 4 semi-finished PCS
      finalOutputQty = Number(actualSheets) * 4;
      unitRate = Math.round((Number(unitRate) / 4) * 10000) / 10000;
    } else if (isTargetUnitGbl) {
      // 4-UP converted to GBL: total PCS / convFactor
      const totalPcs = Number(actualSheets) * 4;
      finalOutputQty = Math.round((totalPcs / (convFactor > 0 ? convFactor : 400)) * 1000) / 1000;
      unitRate = Math.round(((Number(unitRate) / 4) * (convFactor > 0 ? convFactor : 400)) * 10000) / 10000;
    }

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
      remarks: `Output: ${actualSheets} Sheets (${actualReams} Reams → ${finalOutputQty} ${targetSkuDoc.unit || 'Sheets'}) cut from reels via ${finalSlipNumber}`,
      createdBy: toObjectId(req.user?.id),
      company: companyId,
      status: "Posted"
    });
    await ledgerIn.save({ session });

    // Secondary Ledger V2 IN
    const ledgerInV2 = new InventoryLedgerV2({
      transactionType: "Processing Output",
      referenceId: finalSlipNumber,
      skuId: toObjectId(targetSku),
      locationId: destH.locationId,
      qtyIn: finalOutputQty,
      qtyOut: 0,
      balanceAfter: finalOutputQty,
      batchNumber: finalSlipNumber,
      remarks: `Cutting slip ${finalSlipNumber} converted sheet output`,
      company: companyId,
      userId: toObjectId(req.user?.id)
    });
    await ledgerInV2.save({ session });

    // Direct Inventory Quantity Decrement on Source Reel SKU
    if (sourceSkuDoc.presentStock !== undefined) {
      sourceSkuDoc.presentStock = Math.max(0, Number(sourceSkuDoc.presentStock || 0) - Number(totalInputWeight));
    }
    if (sourceSkuDoc.openingStock !== undefined) {
      sourceSkuDoc.openingStock = Math.max(0, Number(sourceSkuDoc.openingStock || 0) - Number(totalInputWeight));
    }
    await sourceSkuDoc.save({ session });

    // Direct Inventory Quantity Increment on Target Converted Sheet SKU
    if (targetSkuDoc.presentStock !== undefined) {
      targetSkuDoc.presentStock = Number(targetSkuDoc.presentStock || 0) + finalOutputQty;
    }
    if (targetSkuDoc.openingStock !== undefined) {
      targetSkuDoc.openingStock = Number(targetSkuDoc.openingStock || 0) + finalOutputQty;
    }
    await targetSkuDoc.save({ session });

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

    broadcast(companyId, {
      entity: "cutting_slip",
      action: "create",
      id: cuttingSlip._id,
      data: cuttingSlip
    });
    broadcast(companyId, {
      entity: "inventory",
      action: "update"
    });

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

    // Restore SKU stock
    const sourceSkuDoc = await SkuV2.findById(slip.sourceSku).session(session);
    if (sourceSkuDoc) {
      if (sourceSkuDoc.presentStock !== undefined) {
        sourceSkuDoc.presentStock = Number(sourceSkuDoc.presentStock || 0) + Number(slip.totalInputWeight);
      }
      if (sourceSkuDoc.openingStock !== undefined) {
        sourceSkuDoc.openingStock = Number(sourceSkuDoc.openingStock || 0) + Number(slip.totalInputWeight);
      }
      await sourceSkuDoc.save({ session });
    }

    const targetSkuDoc = await SkuV2.findById(slip.targetSku).session(session);
    if (targetSkuDoc) {
      const isTargetUnitReam = (targetSkuDoc.unit || '').toLowerCase().includes('ream');
      const finalOut = isTargetUnitReam ? Number(slip.actualReams) : Number(slip.actualSheets);
      if (targetSkuDoc.presentStock !== undefined) {
        targetSkuDoc.presentStock = Math.max(0, Number(targetSkuDoc.presentStock || 0) - finalOut);
      }
      if (targetSkuDoc.openingStock !== undefined) {
        targetSkuDoc.openingStock = Math.max(0, Number(targetSkuDoc.openingStock || 0) - finalOut);
      }
      await targetSkuDoc.save({ session });
    }

    // Remove the associated ledger entries from both ledgers
    await InventoryLedger.deleteMany({
      company: companyId,
      referenceType: "CuttingSlip",
      referenceId: slip.slipNumber
    }).session(session);

    await InventoryLedgerV2.deleteMany({
      company: companyId,
      referenceId: slip.slipNumber
    }).session(session);

    slip.status = "Cancelled";
    await slip.save({ session });

    await session.commitTransaction();
    session.endSession();

    broadcast(companyId, {
      entity: "cutting_slip",
      action: "update",
      id: slip._id,
      data: slip
    });
    broadcast(companyId, {
      entity: "inventory",
      action: "update"
    });

    return res.json({ msg: "Cutting slip cancelled and stock reversed successfully" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error cancelling cutting slip:", error);
    return res.status(400).json({ msg: error.message || "Failed to cancel cutting slip" });
  }
};
