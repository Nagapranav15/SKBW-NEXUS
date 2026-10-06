const mongoose = require("mongoose");
const CuttingSlip = require("../models/cuttingSlipModel");
const InventoryLedger = require("../models/inventoryLedgerModelV2");
const InventoryLedgerV2 = require("../models/inventoryLedgerV2Model");
const SkuV2 = require("../models/skuV2Model");
const WarehouseLocationV2 = require("../models/warehouseLocationV2Model");
const Sequence = require("../models/sequenceModel");
const PurchaseInvoiceV2 = require("../models/purchaseInvoiceV2Model");
const { getNextSequenceNumber, peekNextSequenceNumber, syncSequenceNumber } = require("../utils/sequenceManager");
const { broadcast } = require("../utils/realtimeService");
const { convertAltToPrimary } = require("../utils/uomConversion");

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

// 1. Get next slip number (READ-ONLY: PREVIEW ONLY)
exports.getNextSlipNumber = async (req, res) => {
  try {
    const companyId = req.companyId || req.query.companyId;
    if (!companyId) return res.status(400).json({ msg: "companyId is required" });

    const formatted = await peekNextSequenceNumber("CS", companyId);
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
        { paperType: { $regex: /^reels?$/i } },
        { category: { $regex: /reel/i } },
        { name: { $regex: /reel/i } },
        { skuCode: { $regex: /RM|REEL/i } }
      ]
    }).lean();

    const skuMap = new Map(reelSkus.map(s => [String(s._id), s]));
    const reelSkuIds = reelSkus.map(s => s._id);

    // Step B: Query ALL permanently cut or consumed reels from Cutting Slips and InventoryLedger
    const slips = await CuttingSlip.find({
      company: companyId,
      status: { $ne: "Cancelled" }
    }).select("selectedReels sourceSku").lean();

    const consumedReelNumbers = new Set();
    slips.forEach(s => {
      (s.selectedReels || []).forEach(r => {
        if (r && r.reelNumber) {
          consumedReelNumbers.add(String(r.reelNumber).trim().toLowerCase());
        }
      });
    });

    // Step C: Query ALL ledger records for reel SKUs (status not Cancelled)
    const allLedgers = await InventoryLedger.find({
      company: companyId,
      skuId: { $in: reelSkuIds },
      status: { $ne: "Cancelled" }
    }).sort({ createdAt: 1 }).lean();

    // Track explicit reel OUTs (non-transfers, e.g. processing or dispatch)
    allLedgers.forEach(l => {
      if (l.direction === "OUT") {
        const isTransfer = l.transactionType === "Transfer" ||
          l.referenceType === "StockTransfer" ||
          l.referenceType === "PurchaseInvoiceAllocation";
        (l.reels || []).forEach(r => {
          if (!r) return;
          const rNum = typeof r === "string" ? r : r?.reelNumber;
          if (rNum && !isTransfer) {
            consumedReelNumbers.add(String(rNum).trim().toLowerCase());
          }
        });
      }
    });

    // Check secondary ledger V2 for explicit OUTs
    const v2Outs = await InventoryLedgerV2.find({
      company: companyId,
      skuId: { $in: reelSkuIds },
      qtyOut: { $gt: 0 }
    }).lean();
    v2Outs.forEach(l => {
      const isTransfer = (l.transactionType || "").includes("Transfer");
      (l.reels || []).forEach(r => {
        const rNum = typeof r === "string" ? r : r?.reelNumber;
        if (rNum && !isTransfer) {
          consumedReelNumbers.add(String(rNum).trim().toLowerCase());
        }
      });
    });

    // Step D: Lookup Locations & Invoices
    const locations = await WarehouseLocationV2.find({ company: companyId }).lean();
    const locMap = new Map(locations.map(l => [String(l._id), l]));

    const postedInvoices = await PurchaseInvoiceV2.find({
      company: companyId,
      status: { $ne: "Cancelled" }
    }).lean();

    const result = [];
    const seenReelKeys = new Set();

    // D1. Process individual physical reels directly from Purchase Invoices (Primary Source for Reel Master)
    postedInvoices.forEach(inv => {
      (inv.items || []).forEach(it => {
        const sId = String(it.skuId);
        const sku = skuMap.get(sId);
        if (!sku) return;

        (it.reels || []).forEach((r, idx) => {
          if (!r) return;
          const cleanNo = String(r.reelNumber || r.reelNo || "").trim();
          if (!cleanNo) return;
          const lowerNo = cleanNo.toLowerCase();

          // Exclude if explicitly consumed in a cutting slip or OUT ledger
          if (consumedReelNumbers.has(lowerNo)) return;

          const weight = Number(r.weight) || 0;
          if (weight <= 0.1) return; // Skip 0 kg empty reels

          const uniqueKey = `${sId}_${lowerNo}`;
          if (seenReelKeys.has(uniqueKey)) return;
          seenReelKeys.add(uniqueKey);

          const loc = locMap.get(String(r.locationId || it.locationId));
          const locDisplay = loc ? `${loc.code || loc.name} (${loc.level || 'Godown'})` : "Warehouse";

          result.push({
            id: `${sId}_${it.lotNumber || inv.invoiceNumber}_${cleanNo}`,
            reelNumber: cleanNo,
            weight: weight,
            width: Number(r.width) || Number(sku.width) || 0,
            gsm: Number(r.gsm) || Number(sku.gsm) || 0,
            skuId: sku._id,
            skuName: sku.name,
            skuCode: sku.skuCode,
            locationId: r.locationId || it.locationId,
            locationName: locDisplay,
            purchaseBatch: it.lotNumber || inv.invoiceNumber || "PB-OPEN",
            ratePerKg: Number(it.ratePerKg || it.purchasePrice || sku.costPrice || 80)
          });
        });
      });
    });

    // D2. Process reels registered in InventoryLedger (e.g. transfers, adjustments, opening stock)
    allLedgers.forEach(l => {
      if (l.direction !== "IN" || !Array.isArray(l.reels)) return;
      const sId = String(l.skuId);
      const sku = skuMap.get(sId);
      if (!sku) return;

      l.reels.forEach((r, idx) => {
        if (!r) return;
        const cleanNo = String(r.reelNumber || (typeof r === "string" ? r : "")).trim();
        if (!cleanNo) return;
        const lowerNo = cleanNo.toLowerCase();

        if (consumedReelNumbers.has(lowerNo)) return;

        const weight = Number(r.weight) || (typeof r === "object" ? Number(r.weight) : 0);
        if (weight <= 0.1 && typeof r === "object") return;

        const uniqueKey = `${sId}_${lowerNo}`;
        if (seenReelKeys.has(uniqueKey)) return;
        seenReelKeys.add(uniqueKey);

        const loc = locMap.get(String(l.locationId));
        const locDisplay = loc ? `${loc.code || loc.name} (${loc.level || 'Godown'})` : "Warehouse";

        result.push({
          id: `${sId}_${l.batchNumber || 'batch'}_${cleanNo}`,
          reelNumber: cleanNo,
          weight: weight > 0 ? weight : (Number(l.quantity) || 100),
          width: Number(r.width) || Number(sku.width) || 0,
          gsm: Number(r.gsm) || Number(sku.gsm) || 0,
          skuId: sku._id,
          skuName: sku.name,
          skuCode: sku.skuCode,
          locationId: l.locationId,
          locationName: locDisplay,
          purchaseBatch: l.batchNumber || "PB-OPEN",
          ratePerKg: Number(sku.costPrice || sku.rate || 80)
        });
      });
    });

    // D3. Fallback: For any reel SKU that has on-hand stock in a batch with NO individual reels, expose as a LOT entry
    for (const sku of reelSkus) {
      const skuIdStr = String(sku._id);
      const skuLedgers = allLedgers.filter(l => String(l.skuId) === skuIdStr);
      const totalIn = skuLedgers.filter(l => l.direction === "IN").reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
      const totalOut = skuLedgers.filter(l => l.direction === "OUT").reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
      const skuNetStock = totalIn - totalOut;
      if (skuNetStock <= 0.1) continue;

      // Check if any reels already exist for this SKU
      const hasReels = result.some(r => String(r.skuId) === skuIdStr);
      if (!hasReels) {
        // Expose lot entry
        const uniqueKey = `${skuIdStr}_lot`;
        if (!seenReelKeys.has(uniqueKey)) {
          seenReelKeys.add(uniqueKey);
          const firstIn = skuLedgers.find(l => l.direction === "IN" && Number(l.quantity) > 0);
          const loc = locMap.get(String(firstIn?.locationId));
          result.push({
            id: uniqueKey,
            reelNumber: `LOT-${firstIn?.batchNumber || 'STK'}`,
            weight: skuNetStock,
            width: Number(sku.width) || 0,
            gsm: Number(sku.gsm) || 0,
            skuId: sku._id,
            skuName: sku.name,
            skuCode: sku.skuCode,
            locationId: firstIn?.locationId,
            locationName: loc ? `${loc.code || loc.name}` : "Warehouse",
            purchaseBatch: firstIn?.batchNumber || "PB-OPEN",
            ratePerKg: Number(sku.costPrice || sku.rate || 80)
          });
        }
      }
    }

    // Sort by batch number, then reel number
    result.sort((a, b) => {
      if (a.purchaseBatch !== b.purchaseBatch) return (b.purchaseBatch || '').localeCompare(a.purchaseBatch || '');
      return (a.reelNumber || '').localeCompare(b.reelNumber || '');
    });

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

    // Theoretical maximum yield validation from physics/mass conservation
    // Formula: Theoretical Sheets = (Weight in KG * 10,000,000) / (Width_cm * Length_cm * GSM)
    const w = Number(sheetWidth);
    const l = Number(sheetLength);
    const gsm = Number(sheetGsm);
    const weight = Number(totalInputWeight);
    const validActualSheets = Number(actualSheets);

    let maxTheoSheets = 0;
    if (weight > 0 && w > 0 && l > 0 && gsm > 0) {
      maxTheoSheets = Math.round((weight * 10000000) / (w * l * gsm));
    }

    if (maxTheoSheets > 0) {
      // Allow at most 0.5% float tolerance (e.g. edge millimeter rounding), strictly reject impossible outputs (e.g. 11,200 vs 9,129)
      const maxAllowed = Math.ceil(maxTheoSheets * 1.005);
      if (validActualSheets > maxAllowed) {
        throw new Error(
          `Actual good sheets (${validActualSheets.toLocaleString()}) cannot exceed theoretical maximum yield (${maxTheoSheets.toLocaleString()} sheets) for ${weight} KG of ${gsm} GSM (${w}×${l} cm). Please verify actual production or input reel weight.`
        );
      }
    }

    // Auto-generate slip number if missing
    let finalSlipNumber = reqSlipNumber;
    if (!finalSlipNumber) {
      finalSlipNumber = await generateNextCuttingSlipNumber(companyId, session);
    } else {
      const existing = await CuttingSlip.findOne({ company: companyId, slipNumber: finalSlipNumber }).session(session);
      if (existing) {
        finalSlipNumber = await generateNextCuttingSlipNumber(companyId, session);
      } else {
        await syncSequenceNumber("CS", companyId, finalSlipNumber);
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

    // Standardize Sheets per Ream (standard is 500 sheets)
    const resolvedSheetsPerReam = (Number(sheetsPerReam) > 0 && Number(sheetsPerReam) <= 1000)
      ? Number(sheetsPerReam)
      : 500;

    // Accurate Costing: Reel Value ÷ Valid Actual Parent Sheets, then apply 4-UP once
    const reelValue = Number(totalInputCost || 0);
    const finalTheoreticalSheets = maxTheoSheets || Number(theoreticalSheets) || 0;
    const finalTheoreticalReams = resolvedSheetsPerReam > 0
      ? Number((finalTheoreticalSheets / resolvedSheetsPerReam).toFixed(2))
      : 0;
    const resolvedActualReams = resolvedSheetsPerReam > 0
      ? Number((validActualSheets / resolvedSheetsPerReam).toFixed(2))
      : 0;
    const effectiveCostPerSheet = validActualSheets > 0
      ? reelValue / validActualSheets
      : 0;
    const effectiveCostPerReam = resolvedActualReams > 0
      ? reelValue / resolvedActualReams
      : 0;
    const costPer4UpPiece = validActualSheets > 0
      ? Number((effectiveCostPerSheet / 4).toFixed(4))
      : 0;

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
      totalInputWeight: weight,
      inputRatePerKg: Number(inputRatePerKg || 0),
      totalInputCost: reelValue,
      targetSku: toObjectId(targetSku),
      sheetWidth: w,
      sheetLength: l,
      sheetGsm: gsm,
      sheetsPerReam: resolvedSheetsPerReam,
      startMeterReading: Number(startMeterReading || 0),
      endMeterReading: Number(endMeterReading || 0),
      cutsCount: Number(cutsCount || 0),
      reelsOnStand: Number(reelsOnStand || selectedReels?.length || 1),
      slitsCount: Number(slitsCount || 1),
      theoreticalSheets: finalTheoreticalSheets,
      theoreticalReams: finalTheoreticalReams,
      actualSheets: validActualSheets,
      actualReams: resolvedActualReams,
      varianceSheets: validActualSheets - finalTheoreticalSheets,
      wastePercentage: (finalTheoreticalSheets > 0 && validActualSheets <= finalTheoreticalSheets)
        ? Number((((finalTheoreticalSheets - validActualSheets) / finalTheoreticalSheets) * 100).toFixed(1))
        : 0,
      scrapWeightKg: 0,
      scrapRatePerKg: 0,
      coreCount: 0,
      coreRatePerPc: 0,
      totalScrapCredit: 0,
      netProductionCost: reelValue,
      effectiveCostPerSheet,
      effectiveCostPerReam,
      costPer4UpPiece,
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
    const isTargetUnitGbl = targetUnitNorm === 'gbl' || targetUnitNorm.includes('bundle') || targetUnitNorm.includes('box') || targetUnitNorm.includes('carton');
    const isTargetUnitPcs = targetUnitNorm === 'pcs' || targetUnitNorm === 'piece' || targetUnitNorm === 'pieces' || targetUnitNorm === 'sheets' || targetUnitNorm === 'sheet';
    const convFactor = Number(
      targetSkuDoc.altUnitConversion ||
      targetSkuDoc.conv ||
      targetSkuDoc.booksGbl ||
      targetSkuDoc.pcsPerGbl ||
      0
    );

    // In Cutting Slip, one parent sheet is converted into 4 book-size PCS (4-UP layout)
    const actualBookPcs = Number(validActualSheets) * 4;
    const pieceCost = Number(costPer4UpPiece) || (validActualSheets > 0 ? (Number(totalInputCost || 0) / (validActualSheets * 4)) : 0);

    let finalOutputQty = actualBookPcs;
    let unitRate = pieceCost;

    if (isTargetUnitReam) {
      finalOutputQty = Number(resolvedActualReams) || (resolvedSheetsPerReam > 0 ? Number((validActualSheets / resolvedSheetsPerReam).toFixed(2)) : 0);
      unitRate = finalOutputQty > 0 ? Math.round((Number(totalInputCost || 0) / finalOutputQty) * 10000) / 10000 : 0;
    } else if (isTargetUnitGbl && convFactor > 0) {
      // 1 GBL contains convFactor book-size PCS (e.g. 2,500 PCS / GBL)
      finalOutputQty = Math.round((actualBookPcs / convFactor) * 10000) / 10000;
      unitRate = finalOutputQty > 0 ? Math.round((Number(totalInputCost || 0) / finalOutputQty) * 10000) / 10000 : 0;
    } else if (targetSkuDoc.altUnit && convFactor > 0 && !isTargetUnitPcs) {
      finalOutputQty = convertAltToPrimary(Number(actualBookPcs), targetSkuDoc);
      unitRate = finalOutputQty > 0 ? Math.round((Number(totalInputCost || 0) / finalOutputQty) * 10000) / 10000 : 0;
    } else {
      // Standard book-size PCS of semi-finished goods (post-4-UP)
      finalOutputQty = actualBookPcs;
      unitRate = pieceCost;
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
      targetSkuDoc.avgRate = roundedAvg;
      targetSkuDoc.rate = roundedAvg;
      targetSkuDoc.costPerPiece = Math.round(pieceCost * 10000) / 10000;
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
      .populate("targetSku", "name skuCode unit gsm width length altUnit altUnitConversion booksGbl pcsPerGbl")
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
      const targetUnitNorm = (targetSkuDoc.unit || '').trim().toLowerCase();
      const isTargetUnitReam = targetUnitNorm.includes('ream');
      const isTargetUnitGbl = targetUnitNorm === 'gbl' || targetUnitNorm.includes('bundle') || targetUnitNorm.includes('box') || targetUnitNorm.includes('carton');
      const convFactor = Number(
        targetSkuDoc.altUnitConversion ||
        targetSkuDoc.conv ||
        targetSkuDoc.booksGbl ||
        targetSkuDoc.pcsPerGbl ||
        0
      );

      let finalOut = Number(slip.actualSheets);
      if (isTargetUnitReam) {
        finalOut = Number(slip.actualReams);
      } else if (isTargetUnitGbl && convFactor > 0) {
        finalOut = Math.round((Number(slip.actualSheets) / convFactor) * 10000) / 10000;
      } else if (targetSkuDoc.altUnit && convFactor > 0) {
        finalOut = convertAltToPrimary(Number(slip.actualSheets), targetSkuDoc);
      }

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
