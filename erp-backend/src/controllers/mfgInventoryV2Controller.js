const mongoose = require("mongoose");
const SkuV2 = require("../models/skuV2Model");
const WarehouseLocationV2 = require("../models/warehouseLocationV2Model");
const InventoryLedgerV2 = require("../models/inventoryLedgerV2Model");
const InventoryLedger = require("../models/inventoryLedgerModelV2");
const Sequence = require("../models/sequenceModel");
const Metadata = require("../models/metadataModel");

const toObjectId = (id) => {
  if (!id) return null;
  try {
    return new mongoose.Types.ObjectId(id);
  } catch (e) {
    return null;
  }
};

// ── SKU MASTER V2 ─────────────────────────────────────────────────────────────

exports.getSkus = async (req, res, next) => {
  try {
    const { companyId, category, search, status } = req.query;
    if (!companyId) {
      return res.status(400).json({ msg: "companyId query parameter is required" });
    }

    const query = { company: toObjectId(companyId) };
    if (category) {
      query.category = category;
    }
    if (status) {
      query.status = status;
    }
    if (search) {
      query.$or = [
        { skuCode: { $regex: search, $options: "i" } },
        { name: { $regex: search, $options: "i" } },
        { brand: { $regex: search, $options: "i" } }
      ];
    }

    const skus = await SkuV2.find(query).sort({ createdAt: -1 });
    res.json(skus);
  } catch (err) {
    next(err);
  }
};

exports.createSku = async (req, res, next) => {
  try {
    const { skuCode, name, category, unit, altUnit, altUnitConversion, paperType, gsm, width, length, brand, title, group, ruleType, pages, booksGbl, status, company } = req.body;
    if (!company) {
      return res.status(400).json({ msg: "company is required" });
    }

    const exists = await SkuV2.findOne({ skuCode, company: toObjectId(company) });
    if (exists) {
      return res.status(400).json({ msg: `SKU Code '${skuCode}' already exists for this company` });
    }

    const newSku = new SkuV2({
      skuCode,
      name,
      category,
      unit,
      altUnit,
      altUnitConversion: altUnitConversion ? Number(altUnitConversion) : undefined,
      paperType: paperType || "None",
      gsm: gsm ? Number(gsm) : undefined,
      width: width ? Number(width) : undefined,
      length: length ? Number(length) : undefined,
      brand,
      title: title || "",
      group: group || "",
      ruleType,
      pages: pages ? Number(pages) : undefined,
      booksGbl: booksGbl ? Number(booksGbl) : undefined,
      status: status || "Active",
      company: toObjectId(company),
      createdBy: req.user?.id ? toObjectId(req.user.id) : undefined
    });

    await newSku.save();
    res.status(201).json(newSku);
  } catch (err) {
    next(err);
  }
};

exports.updateSku = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { skuCode, name, category, unit, altUnit, altUnitConversion, paperType, gsm, width, length, brand, title, group, ruleType, pages, booksGbl, status, company } = req.body;
    
    if (!company) {
      return res.status(400).json({ msg: "company is required" });
    }

    const sku = await SkuV2.findOne({ _id: toObjectId(id), company: toObjectId(company) });
    if (!sku) {
      return res.status(404).json({ msg: "SKU not found" });
    }

    const exists = await SkuV2.findOne({ 
      skuCode, 
      company: toObjectId(company), 
      _id: { $ne: toObjectId(id) } 
    });
    if (exists) {
      return res.status(400).json({ msg: `SKU Code '${skuCode}' already exists for this company` });
    }

    sku.skuCode = skuCode;
    sku.name = name;
    sku.category = category;
    sku.unit = unit;
    sku.altUnit = altUnit;
    sku.altUnitConversion = altUnitConversion ? Number(altUnitConversion) : undefined;
    sku.paperType = paperType || "None";
    sku.gsm = gsm ? Number(gsm) : undefined;
    sku.width = width ? Number(width) : undefined;
    sku.length = length ? Number(length) : undefined;
    sku.brand = brand || "";
    sku.title = title || "";
    sku.group = group || "";
    sku.ruleType = ruleType;
    sku.pages = pages ? Number(pages) : undefined;
    sku.booksGbl = booksGbl ? Number(booksGbl) : undefined;
    sku.status = status || "Active";

    await sku.save();
    res.json(sku);
  } catch (err) {
    next(err);
  }
};

exports.deleteSku = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({ msg: "companyId query parameter is required" });
    }

    const skuObjId = toObjectId(id);
    const companyObjId = toObjectId(companyId);

    const sku = await SkuV2.findOne({ _id: skuObjId, company: companyObjId });
    if (!sku) {
      return res.status(404).json({ msg: "SKU not found" });
    }

    const count = await InventoryLedgerV2.countDocuments({ skuId: skuObjId, company: companyObjId });
    if (count > 0) {
      return res.status(400).json({ 
        msg: `Cannot delete SKU '${sku.skuCode}' because it has active inventory ledger history. Consider changing its status to Inactive.` 
      });
    }

    await SkuV2.deleteOne({ _id: skuObjId });
    res.json({ msg: "SKU deleted successfully" });
  } catch (err) {
    next(err);
  }
};

exports.bulkImportSkus = async (req, res, next) => {
  try {
    const { skus, company } = req.body;
    if (!company) {
      return res.status(400).json({ msg: "company is required" });
    }
    if (!Array.isArray(skus)) {
      return res.status(400).json({ msg: "skus must be a valid array" });
    }

    const companyObjId = toObjectId(company);
    const existingSkuCodes = new Set(
      (await SkuV2.find({ company: companyObjId }, "skuCode")).map(s => s.skuCode)
    );

    const toInsert = [];
    const skipped = [];

    for (const item of skus) {
      if (!item.skuCode || !item.name || !item.category || !item.unit) {
        skipped.push({ code: item.skuCode || "N/A", reason: "Missing required fields (Code/Name/Category/Unit)" });
        continue;
      }

      if (existingSkuCodes.has(item.skuCode)) {
        skipped.push({ code: item.skuCode, reason: "SKU code already exists" });
        continue;
      }

      toInsert.push({
        skuCode: item.skuCode,
        name: item.name,
        category: item.category,
        unit: item.unit,
        gsm: item.gsm ? Number(item.gsm) : undefined,
        width: item.width ? Number(item.width) : undefined,
        length: item.length ? Number(item.length) : undefined,
        brand: item.brand || "",
        ruleType: item.ruleType,
        pages: item.pages ? Number(item.pages) : undefined,
        booksGbl: item.booksGbl ? Number(item.booksGbl) : undefined,
        status: item.status || "Active",
        company: companyObjId,
        createdBy: req.user?.id ? toObjectId(req.user.id) : undefined
      });
    }

    if (toInsert.length > 0) {
      await SkuV2.insertMany(toInsert);
    }

    res.json({
      msg: `Bulk import completed: ${toInsert.length} imported, ${skipped.length} skipped`,
      importedCount: toInsert.length,
      skipped
    });
  } catch (err) {
    next(err);
  }
};

// ── WAREHOUSE STRUCTURE V2 ───────────────────────────────────────────────────

exports.getWarehouseHierarchy = async (req, res, next) => {
  try {
    const { companyId } = req.query;
    if (!companyId) {
      return res.status(400).json({ msg: "companyId query parameter is required" });
    }

    const locations = await WarehouseLocationV2.find({ company: toObjectId(companyId) }).lean();
    res.json(locations);
  } catch (err) {
    next(err);
  }
};

exports.createWarehouseLocation = async (req, res, next) => {
  try {
    const { name, level, parentId, capacity, unit, status, company } = req.body;
    if (!company) {
      return res.status(400).json({ msg: "company is required" });
    }

    const parentObjId = parentId ? toObjectId(parentId) : null;

    // Validate level/parent hierarchy rules
    if (level === "Factory" && parentObjId !== null) {
      return res.status(400).json({ msg: "A Factory node cannot have a parent node" });
    }

    if (parentObjId) {
      const parentNode = await WarehouseLocationV2.findOne({ _id: parentObjId, company: toObjectId(company) });
      if (!parentNode) {
        return res.status(400).json({ msg: "Specified parent node does not exist" });
      }

      if (level === "Floor" && parentNode.level !== "Factory") {
        return res.status(400).json({ msg: "A Floor must have a Factory parent node" });
      }
      if (level === "Zone" && parentNode.level !== "Floor") {
        return res.status(400).json({ msg: "A Zone must have a Floor parent node" });
      }
      if (level === "Storage Location" && parentNode.level !== "Zone") {
        return res.status(400).json({ msg: "A Storage Location must have a Zone parent node" });
      }
    } else if (level !== "Factory") {
      return res.status(400).json({ msg: `A ${level} node must have a parent node` });
    }

    const exists = await WarehouseLocationV2.findOne({
      name,
      parentId: parentObjId,
      company: toObjectId(company)
    });
    if (exists) {
      return res.status(400).json({ msg: `Location '${name}' already exists under the same parent node` });
    }

    const newLoc = new WarehouseLocationV2({
      name,
      level,
      parentId: parentObjId,
      capacity: capacity ? Number(capacity) : undefined,
      unit: unit || "kg",
      status: status || "Active",
      company: toObjectId(company)
    });

    await newLoc.save();
    res.status(201).json(newLoc);
  } catch (err) {
    next(err);
  }
};

exports.updateWarehouseLocation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, level, parentId, capacity, unit, status, company } = req.body;
    if (!company) {
      return res.status(400).json({ msg: "company is required" });
    }

    const loc = await WarehouseLocationV2.findOne({ _id: toObjectId(id), company: toObjectId(company) });
    if (!loc) {
      return res.status(404).json({ msg: "Warehouse location node not found" });
    }

    const parentObjId = parentId ? toObjectId(parentId) : null;

    // Validate level/parent hierarchy rules
    if (level === "Factory" && parentObjId !== null) {
      return res.status(400).json({ msg: "A Factory node cannot have a parent node" });
    }

    if (parentObjId) {
      const parentNode = await WarehouseLocationV2.findOne({ _id: parentObjId, company: toObjectId(company) });
      if (!parentNode) {
        return res.status(400).json({ msg: "Specified parent node does not exist" });
      }

      if (level === "Floor" && parentNode.level !== "Factory") {
        return res.status(400).json({ msg: "A Floor must have a Factory parent node" });
      }
      if (level === "Zone" && parentNode.level !== "Floor") {
        return res.status(400).json({ msg: "A Zone must have a Floor parent node" });
      }
      if (level === "Storage Location" && parentNode.level !== "Zone") {
        return res.status(400).json({ msg: "A Storage Location must have a Zone parent node" });
      }
    } else if (level !== "Factory") {
      return res.status(400).json({ msg: `A ${level} node must have a parent node` });
    }

    // Name uniqueness check excluding self
    const exists = await WarehouseLocationV2.findOne({
      name,
      parentId: parentObjId,
      company: toObjectId(company),
      _id: { $ne: toObjectId(id) }
    });
    if (exists) {
      return res.status(400).json({ msg: `Location '${name}' already exists under the same parent node` });
    }

    loc.name = name;
    loc.level = level;
    loc.parentId = parentObjId;
    loc.capacity = capacity ? Number(capacity) : undefined;
    loc.unit = unit || "kg";
    loc.status = status || "Active";

    await loc.save();
    res.json(loc);
  } catch (err) {
    next(err);
  }
};

exports.deleteWarehouseLocation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({ msg: "companyId query parameter is required" });
    }

    const locObjId = toObjectId(id);
    const companyObjId = toObjectId(companyId);

    const loc = await WarehouseLocationV2.findOne({ _id: locObjId, company: companyObjId });
    if (!loc) {
      return res.status(404).json({ msg: "Warehouse location node not found" });
    }

    // 1. Check if it has child sub-nodes
    const childrenCount = await WarehouseLocationV2.countDocuments({ parentId: locObjId, company: companyObjId });
    if (childrenCount > 0) {
      return res.status(400).json({
        msg: `Cannot delete location '${loc.name}' because it contains ${childrenCount} child nodes. Please delete child nodes first.`
      });
    }

    // 2. Check if Storage Location has any ledger entries
    if (loc.level === "Storage Location") {
      const ledgerCount = await InventoryLedgerV2.countDocuments({ locationId: locObjId, company: companyObjId });
      if (ledgerCount > 0) {
        return res.status(400).json({
          msg: `Cannot delete location '${loc.name}' because it has active inventory transactions logged in the ledger. Consider changing its status to Maintenance.`
        });
      }
    }

    await WarehouseLocationV2.deleteOne({ _id: locObjId });
    res.json({ msg: "Warehouse location node deleted successfully" });
  } catch (err) {
    next(err);
  }
};

exports.getLocationDetails = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { companyId } = req.query;

    const location = await WarehouseLocationV2.findOne({ _id: toObjectId(id), company: toObjectId(companyId) });
    if (!location) {
      return res.status(404).json({ msg: "Warehouse location not found" });
    }

    // Aggregate stored SKUs from ledger entries
    const ledgerAgg = await InventoryLedger.aggregate([
      { 
        $match: { 
          locationId: toObjectId(id), 
          company: toObjectId(companyId),
          status: "Posted"
        } 
      },
      {
        $group: {
          _id: "$skuId",
          qtyInTotal: {
            $sum: {
              $cond: [{ $eq: ["$direction", "IN"] }, "$quantity", 0]
            }
          },
          qtyOutTotal: {
            $sum: {
              $cond: [{ $eq: ["$direction", "OUT"] }, "$quantity", 0]
            }
          }
        }
      },
      {
        $project: {
          onHand: { $subtract: ["$qtyInTotal", "$qtyOutTotal"] }
        }
      },
      { $match: { onHand: { $gt: 0 } } }
    ]);

    const storedSkuIds = ledgerAgg.map(a => a._id);
    const skus = await SkuV2.find({ _id: { $in: storedSkuIds } }).lean();

    const storedSkus = ledgerAgg.map(agg => {
      const matchSku = skus.find(s => String(s._id) === String(agg._id));
      return {
        sku: matchSku || { skuCode: "Unknown", name: "Unknown", category: "Unknown" },
        quantity: agg.onHand
      };
    });

    // Fetch recent movements inside this location
    const recentMovements = await InventoryLedger.find({ 
      locationId: toObjectId(id), 
      company: toObjectId(companyId),
      status: "Posted"
    })
      .populate("skuId", "skuCode name category unit")
      .populate("createdBy", "fullName")
      .sort({ createdAt: -1 })
      .limit(10);

    // Compute occupied % dynamically based on capacity if available
    let totalQty = storedSkus.reduce((sum, item) => sum + item.quantity, 0);
    let occupiedPercent = 0;
    if (location.capacity && location.capacity > 0) {
      occupiedPercent = Math.min(Math.round((totalQty / location.capacity) * 100), 100);
      if (location.occupiedPercent !== occupiedPercent) {
        location.occupiedPercent = occupiedPercent;
        await location.save();
      }
    }

    res.json({
      location,
      storedSkus,
      recentMovements,
      totalQty
    });
  } catch (err) {
    next(err);
  }
};

// ── INVENTORY LEDGER V2 ───────────────────────────────────────────────────────

exports.getLedger = async (req, res, next) => {
  try {
    const { companyId, skuId, locationId, transactionType, batchNumber, startDate, endDate } = req.query;
    if (!companyId) {
      return res.status(400).json({ msg: "companyId query parameter is required" });
    }

    const query = { company: toObjectId(companyId) };
    if (skuId) query.skuId = toObjectId(skuId);
    if (locationId) query.locationId = toObjectId(locationId);
    if (transactionType) query.transactionType = transactionType;
    if (batchNumber) query.batchNumber = batchNumber;

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const ledger = await InventoryLedgerV2.find(query)
      .populate("skuId", "skuCode name category unit gsm ruleType")
      .populate("locationId", "name level parentId")
      .populate("userId", "fullName email")
      .sort({ timestamp: -1, _id: -1 });

    res.json(ledger);
  } catch (err) {
    next(err);
  }
};

exports.recordTransfer = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { skuId, fromLocationId, toLocationId, quantity, remarks, company, batchNumber } = req.body;
    if (!company) {
      return res.status(400).json({ msg: "company is required" });
    }
    const transferQty = Number(quantity);
    if (isNaN(transferQty) || transferQty <= 0) {
      return res.status(400).json({ msg: "Transfer quantity must be a positive number" });
    }

    const companyObjId = toObjectId(company);
    const skuObjId = toObjectId(skuId);
    const fromLocObjId = toObjectId(fromLocationId);
    const toLocObjId = toObjectId(toLocationId);

    // Resolve source SKU
    const skuDoc = await SkuV2.findOne({ _id: skuObjId, company: companyObjId });
    if (!skuDoc) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ msg: "SKU not found" });
    }

    // Resolve source location hierarchy
    const fromLocation = await WarehouseLocationV2.findOne({ _id: fromLocObjId, company: companyObjId });
    if (!fromLocation) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ msg: "Source location not found" });
    }
    const fromZone = await WarehouseLocationV2.findOne({ _id: fromLocation.parentId, company: companyObjId });
    const fromFloor = fromZone ? await WarehouseLocationV2.findOne({ _id: fromZone.parentId, company: companyObjId }) : null;
    const fromWarehouse = fromFloor ? await WarehouseLocationV2.findOne({ _id: fromFloor.parentId, company: companyObjId }) : null;

    // Calculate source location's current balance from primary InventoryLedger
    const matchCriteria = { 
      skuId: skuObjId, 
      locationId: fromLocObjId, 
      company: companyObjId 
    };
    if (batchNumber) {
      matchCriteria.batchNumber = batchNumber;
    }

    const sourceLedgerAgg = await InventoryLedger.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: null,
          onHand: {
            $sum: {
              $cond: [{ $eq: ["$direction", "IN"] }, "$quantity", { $subtract: [0, "$quantity"] }]
            }
          }
        }
      }
    ]);

    const sourceBalance = sourceLedgerAgg.length > 0 ? sourceLedgerAgg[0].onHand : 0;
    if (sourceBalance < transferQty) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ msg: `Insufficient stock at source location. Available: ${sourceBalance} ${skuDoc.unit}` });
    }

    // Resolve destination location hierarchy
    const destLocation = await WarehouseLocationV2.findOne({ _id: toLocObjId, company: companyObjId });
    if (!destLocation) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ msg: "Destination location not found" });
    }
    if (destLocation.level !== "Storage Location") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ msg: "Destination location must be a Storage Location node" });
    }

    // Check capacity constraint on destination location
    if (destLocation.capacity && destLocation.capacity > 0) {
      const totalOccupiedAgg = await InventoryLedger.aggregate([
        { $match: { locationId: toLocObjId, company: companyObjId } },
        {
          $group: {
            _id: null,
            totalQty: {
              $sum: {
                $cond: [{ $eq: ["$direction", "IN"] }, "$quantity", { $subtract: [0, "$quantity"] }]
              }
            }
          }
        }
      ]);
      const totalOccupied = totalOccupiedAgg.length > 0 ? totalOccupiedAgg[0].totalQty : 0;
      if (totalOccupied + transferQty > destLocation.capacity) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ 
          msg: `Transfer rejected. Destination storage has insufficient space. Capacity: ${destLocation.capacity} ${destLocation.unit || 'kg'}, Currently Occupied: ${totalOccupied} ${destLocation.unit || 'kg'}, Space Available: ${destLocation.capacity - totalOccupied} ${destLocation.unit || 'kg'}` 
        });
      }
    }

    const toZone = await WarehouseLocationV2.findOne({ _id: destLocation.parentId, company: companyObjId });
    const toFloor = toZone ? await WarehouseLocationV2.findOne({ _id: toZone.parentId, company: companyObjId }) : null;
    const toWarehouse = toFloor ? await WarehouseLocationV2.findOne({ _id: toFloor.parentId, company: companyObjId }) : null;

    // Calculate destination location's current balance
    const destMatchCriteria = {
      skuId: skuObjId,
      locationId: toLocObjId,
      company: companyObjId
    };
    if (batchNumber) {
      destMatchCriteria.batchNumber = batchNumber;
    }
    const destLedgerAgg = await InventoryLedger.aggregate([
      { $match: destMatchCriteria },
      {
        $group: {
          _id: null,
          onHand: {
            $sum: {
              $cond: [{ $eq: ["$direction", "IN"] }, "$quantity", { $subtract: [0, "$quantity"] }]
            }
          }
        }
      }
    ]);
    const destBalance = destLedgerAgg.length > 0 ? destLedgerAgg[0].onHand : 0;

    // Generate transaction references
    const referenceId = `TXF-${Date.now()}`;
    const seqDoc = await Sequence.findOneAndUpdate(
      { prefix: "IL" },
      { $inc: { sequence: 1 } },
      { new: true, upsert: true, session }
    );
    const transactionNumber = `IL-${String(seqDoc.sequence).padStart(8, '0')}`;

    // 1. OUT entry at source in primary ledger
    const primOut = new InventoryLedger({
      transactionNumber,
      transactionType: "Transfer",
      skuId: skuObjId,
      quantity: transferQty,
      unit: skuDoc.unit || "kg",
      direction: "OUT",
      referenceType: "StockTransfer",
      referenceId,
      batchNumber: batchNumber || "UNKNOWN",
      warehouseId: fromWarehouse?._id || fromLocObjId,
      floorId: fromFloor?._id || fromLocObjId,
      zoneId: fromZone?._id || fromLocObjId,
      locationId: fromLocObjId,
      remarks: remarks || `Transfer to ${destLocation.name}`,
      createdBy: toObjectId(req.user.id),
      company: companyObjId,
      status: "Posted"
    });
    await primOut.save({ session });

    // 2. IN entry at destination in primary ledger
    const primIn = new InventoryLedger({
      transactionNumber,
      transactionType: "Transfer",
      skuId: skuObjId,
      quantity: transferQty,
      unit: skuDoc.unit || "kg",
      direction: "IN",
      referenceType: "StockTransfer",
      referenceId,
      batchNumber: batchNumber || "UNKNOWN",
      warehouseId: toWarehouse?._id || toLocObjId,
      floorId: toFloor?._id || toLocObjId,
      zoneId: toZone?._id || toLocObjId,
      locationId: toLocObjId,
      remarks: remarks || `Transfer from ${fromLocation.name}`,
      createdBy: toObjectId(req.user.id),
      company: companyObjId,
      status: "Posted"
    });
    await primIn.save({ session });

    // 3. QtyOut entry at source in V2 audit ledger
    const ledgerOut = new InventoryLedgerV2({
      transactionType: "Location Transfer",
      referenceId,
      skuId: skuObjId,
      locationId: fromLocObjId,
      qtyOut: transferQty,
      balanceAfter: sourceBalance - transferQty,
      company: companyObjId,
      remarks: remarks || `Transfer to ${destLocation.name}`,
      userId: toObjectId(req.user.id)
    });
    await ledgerOut.save({ session });

    // 4. QtyIn entry at destination in V2 audit ledger
    const ledgerIn = new InventoryLedgerV2({
      transactionType: "Location Transfer",
      referenceId,
      skuId: skuObjId,
      locationId: toLocObjId,
      qtyIn: transferQty,
      balanceAfter: destBalance + transferQty,
      company: companyObjId,
      remarks: remarks || `Transfer from ${fromLocation.name}`,
      userId: toObjectId(req.user.id)
    });
    await ledgerIn.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({ msg: "Transfer successful", referenceId });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

// ── INVENTORY BALANCE V2 ─────────────────────────────────────────────────────

exports.getBalances = async (req, res, next) => {
  try {
    const { companyId, category, groupByBatch } = req.query;
    if (!companyId) {
      return res.status(400).json({ msg: "companyId query parameter is required" });
    }

    const isGroupBatch = groupByBatch === 'true';
    const groupFields = isGroupBatch
      ? { skuId: "$skuId", locationId: "$locationId", batchNumber: "$batchNumber" }
      : { skuId: "$skuId", locationId: "$locationId" };

    const pipeline = [
      { $match: { company: toObjectId(companyId) } },
      {
        $group: {
          _id: groupFields,
          qtyInTotal: {
            $sum: {
              $cond: [{ $eq: ["$direction", "IN"] }, "$quantity", 0]
            }
          },
          qtyOutTotal: {
            $sum: {
              $cond: [{ $eq: ["$direction", "OUT"] }, "$quantity", 0]
            }
          },
          reelsList: {
            $push: {
              $cond: [{ $eq: ["$direction", "IN"] }, "$reels", []]
            }
          }
        }
      },
      {
        $project: {
          skuId: "$_id.skuId",
          locationId: "$_id.locationId",
          batchNumber: isGroupBatch ? "$_id.batchNumber" : null,
          onHand: { $subtract: ["$qtyInTotal", "$qtyOutTotal"] },
          reels: {
            $reduce: {
              input: "$reelsList",
              initialValue: [],
              in: { $concatArrays: ["$$value", "$$this"] }
            }
          }
        }
      },
      { $match: { onHand: { $gt: 0 } } },
      {
        $lookup: {
          localField: "skuId",
          from: "skuv2",
          foreignField: "_id",
          as: "sku"
        }
      },
      { $unwind: "$sku" },
      {
        $lookup: {
          localField: "locationId",
          from: "warehouselocationv2",
          foreignField: "_id",
          as: "location"
        }
      },
      { $unwind: "$location" }
    ];

    if (category) {
      pipeline.push({ $match: { "sku.category": category } });
    }

    const balances = await InventoryLedger.aggregate(pipeline);
    res.json(balances);
  } catch (err) {
    next(err);
  }
};

// ── DASHBOARD V2 STATS ───────────────────────────────────────────────────────

exports.getDashboardStats = async (req, res, next) => {
  try {
    const { companyId } = req.query;
    if (!companyId) {
      return res.status(400).json({ msg: "companyId query parameter is required" });
    }

    const companyObjId = toObjectId(companyId);

    // Total Unique SKUs
    const totalSkus = await SkuV2.countDocuments({ company: companyObjId, status: "Active" });

    // Category Quantities & Values
    const categoryAgg = await InventoryLedger.aggregate([
      { $match: { company: companyObjId } },
      {
        $group: {
          _id: { skuId: "$skuId" },
          qty: {
            $sum: {
              $cond: [{ $eq: ["$direction", "IN"] }, "$quantity", { $subtract: [0, "$quantity"] }]
            }
          }
        }
      },
      {
        $lookup: {
          from: "skuv2",
          localField: "_id.skuId",
          foreignField: "_id",
          as: "sku"
        }
      },
      { $unwind: "$sku" },
      {
        $group: {
          _id: "$sku.category",
          totalQty: { $sum: "$qty" }
        }
      }
    ]);

    const stats = {
      totalSkus,
      rawMaterialStock: 0,
      semiFinishedStock: 0,
      finishedGoodsStock: 0,
      inventoryValue: 0, 
      recentTransactions: [],
      lowStockAlerts: [],
      categoryDistribution: []
    };

    categoryAgg.forEach(item => {
      if (item._id === "Raw Material") stats.rawMaterialStock = item.totalQty;
      if (item._id === "Semi Finished") stats.semiFinishedStock = item.totalQty;
      if (item._id === "Finished Goods") stats.finishedGoodsStock = item.totalQty;
    });

    stats.inventoryValue = (stats.rawMaterialStock * 45) + (stats.semiFinishedStock * 25) + (stats.finishedGoodsStock * 60);

    // Recent Transactions
    stats.recentTransactions = await InventoryLedger.find({ company: companyObjId })
      .populate("skuId", "skuCode name category unit")
      .populate("locationId", "name level")
      .sort({ createdAt: -1 })
      .limit(10);

    // Low Stock Alerts (Mock thresholds: Reels < 200, Sheets < 1000, Pcs < 500)
    const stockBalances = await InventoryLedger.aggregate([
      { $match: { company: companyObjId } },
      {
        $group: {
          _id: "$skuId",
          onHand: {
            $sum: {
              $cond: [{ $eq: ["$direction", "IN"] }, "$quantity", { $subtract: [0, "$quantity"] }]
            }
          }
        }
      },
      {
        $lookup: {
          from: "skuv2",
          localField: "_id",
          foreignField: "_id",
          as: "sku"
        }
      },
      { $unwind: "$sku" }
    ]);

    stockBalances.forEach(item => {
      let isLow = false;
      if (item.sku.category === "Raw Material" && item.onHand < 200) isLow = true;
      if (item.sku.category === "Semi Finished" && item.onHand < 1000) isLow = true;
      if (item.sku.category === "Finished Goods" && item.onHand < 500) isLow = true;

      if (isLow) {
        stats.lowStockAlerts.push({
          skuCode: item.sku.skuCode,
          name: item.sku.name,
          category: item.sku.category,
          onHand: item.onHand,
          unit: item.sku.unit
        });
      }
    });

    // Distribution
    const totalStock = stats.rawMaterialStock + stats.semiFinishedStock + stats.finishedGoodsStock;
    if (totalStock > 0) {
      stats.categoryDistribution = [
        { category: "Raw Material", percentage: Math.round((stats.rawMaterialStock / totalStock) * 100) },
        { category: "Semi Finished", percentage: Math.round((stats.semiFinishedStock / totalStock) * 100) },
        { category: "Finished Goods", percentage: Math.round((stats.finishedGoodsStock / totalStock) * 100) }
      ];
    } else {
      stats.categoryDistribution = [
        { category: "Raw Material", percentage: 0 },
        { category: "Semi Finished", percentage: 0 },
        { category: "Finished Goods", percentage: 0 }
      ];
    }

    res.json(stats);
  } catch (err) {
    next(err);
  }
};

// ── NEW INVENTORY LEDGER ENGINE V2 ───────────────────────────────────────────

exports.getInventoryLedger = async (req, res, next) => {
  try {
    const { companyId, skuId, locationId, transactionType, direction, startDate, endDate, referenceId, search, page = 1, limit = 20 } = req.query;
    if (!companyId) {
      return res.status(400).json({ msg: "companyId query parameter is required" });
    }

    const query = { company: toObjectId(companyId) };
    if (skuId) query.skuId = toObjectId(skuId);
    if (locationId) query.locationId = toObjectId(locationId);
    if (transactionType) query.transactionType = transactionType;
    if (direction) query.direction = direction;
    if (referenceId) query.referenceId = { $regex: referenceId, $options: "i" };

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    if (search) {
      query.$or = [
        { transactionNumber: { $regex: search, $options: "i" } },
        { referenceId: { $regex: search, $options: "i" } },
        { remarks: { $regex: search, $options: "i" } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    
    const [entries, total] = await Promise.all([
      InventoryLedger.find(query)
        .populate("skuId", "skuCode name category unit gsm ruleType")
        .populate("warehouseId", "name level")
        .populate("floorId", "name level")
        .populate("zoneId", "name level")
        .populate("locationId", "name level parentId")
        .populate("createdBy", "fullName email")
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(Number(limit)),
      InventoryLedger.countDocuments(query)
    ]);

    res.json({
      entries,
      total,
      page: Number(page),
      limit: Number(limit)
    });
  } catch (err) {
    next(err);
  }
};

exports.getInventoryLedgerById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({ msg: "companyId query parameter is required" });
    }

    const entry = await InventoryLedger.findOne({ _id: toObjectId(id), company: toObjectId(companyId) })
      .populate("skuId", "skuCode name category unit gsm brand ruleType")
      .populate("warehouseId", "name level")
      .populate("floorId", "name level")
      .populate("zoneId", "name level")
      .populate("locationId", "name level capacity unit occupiedPercent")
      .populate("createdBy", "fullName email");

    if (!entry) {
      return res.status(404).json({ msg: "Inventory ledger transaction not found" });
    }

    res.json(entry);
  } catch (err) {
    next(err);
  }
};

exports.createInventoryLedgerEntry = async (req, res, next) => {
  try {
    const { transactionType, skuId, quantity, unit, direction, referenceType, referenceId, locationId, remarks, status, company } = req.body;
    
    if (!company) {
      return res.status(400).json({ msg: "company is required" });
    }
    if (!skuId || !quantity || !unit || !direction || !referenceType || !referenceId || !locationId || !transactionType) {
      return res.status(400).json({ msg: "Missing required fields for ledger entry creation" });
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ msg: "Quantity must be a positive number" });
    }

    const companyObjId = toObjectId(company);

    const sku = await SkuV2.findOne({ _id: toObjectId(skuId), company: companyObjId });
    if (!sku) {
      return res.status(400).json({ msg: "SKU not found or mismatch" });
    }

    const location = await WarehouseLocationV2.findOne({ _id: toObjectId(locationId), company: companyObjId });
    if (!location) {
      return res.status(400).json({ msg: "Storage Location node not found" });
    }
    if (location.level !== "Storage Location") {
      return res.status(400).json({ msg: "Inventory must be posted to a Storage Location node" });
    }

    const zone = await WarehouseLocationV2.findOne({ _id: location.parentId, company: companyObjId });
    if (!zone || zone.level !== "Zone") {
      return res.status(400).json({ msg: "Hierarchy error: Storage Location parent must be a Zone" });
    }

    const floor = await WarehouseLocationV2.findOne({ _id: zone.parentId, company: companyObjId });
    if (!floor || floor.level !== "Floor") {
      return res.status(400).json({ msg: "Hierarchy error: Zone parent must be a Floor" });
    }

    const warehouse = await WarehouseLocationV2.findOne({ _id: floor.parentId, company: companyObjId });
    if (!warehouse || warehouse.level !== "Factory") {
      return res.status(400).json({ msg: "Hierarchy error: Floor parent must be a Factory" });
    }

    // Insufficient stock check for OUT direction
    if (direction === "OUT") {
      const balanceAgg = await InventoryLedger.aggregate([
        { $match: { company: companyObjId, skuId: sku._id, locationId: location._id } },
        {
          $group: {
            _id: null,
            qtyInTotal: {
              $sum: {
                $cond: [{ $eq: ["$direction", "IN"] }, "$quantity", 0]
              }
            },
            qtyOutTotal: {
              $sum: {
                $cond: [{ $eq: ["$direction", "OUT"] }, "$quantity", 0]
              }
            }
          }
        }
      ]);

      const onHand = balanceAgg.length > 0 ? (balanceAgg[0].qtyInTotal - balanceAgg[0].qtyOutTotal) : 0;
      if (qty > onHand) {
        return res.status(400).json({
          msg: `Insufficient stock. Requested: ${qty} ${unit}, Available: ${onHand} ${unit} at storage location '${location.name}'`
        });
      }
    }

    const seqDoc = await Sequence.findOneAndUpdate(
      { prefix: "IL" },
      { $inc: { sequence: 1 } },
      { new: true, upsert: true }
    );
    const transactionNumber = `IL-${String(seqDoc.sequence).padStart(8, '0')}`;

    const newEntry = new InventoryLedger({
      transactionNumber,
      transactionType,
      skuId: sku._id,
      quantity: qty,
      unit,
      direction,
      referenceType,
      referenceId,
      batchNumber: req.body.batchNumber || referenceId,
      warehouseId: warehouse._id,
      floorId: floor._id,
      zoneId: zone._id,
      locationId: location._id,
      remarks: remarks || "",
      createdBy: toObjectId(req.user.id),
      status: status || "Posted",
      company: companyObjId
    });

    await newEntry.save();
    res.status(201).json(newEntry);
  } catch (err) {
    next(err);
  }
};

exports.getMetadata = async (req, res, next) => {
  try {
    const { companyId } = req.query;
    if (!companyId) {
      return res.status(400).json({ msg: "companyId query parameter is required" });
    }
    const companyObjId = toObjectId(companyId);
    let doc = await Metadata.findOne({ company: companyObjId });
    if (!doc) {
      doc = new Metadata({ company: companyObjId });
      await doc.save();
    } else {
      let docUpdated = false;
      if (!doc.groups || doc.groups.length === 0) {
        doc.groups = ["132P Happy days (UR)", "220P Happy days (SR)"];
        docUpdated = true;
      }
      if (!doc.brands || doc.brands.length === 0) {
        doc.brands = ["Happy Days", "Classmate", "Navneet"];
        doc.markModified("brands");
        docUpdated = true;
      }
      if (doc.categoryFields) {
        const sf = doc.categoryFields.get ? doc.categoryFields.get("Semi Finished") : (doc.categoryFields["Semi Finished"] || []);
        if (sf && !sf.includes("group")) {
          sf.push("group");
          if (doc.categoryFields.set) {
            doc.categoryFields.set("Semi Finished", sf);
          } else {
            doc.categoryFields["Semi Finished"] = sf;
          }
          docUpdated = true;
        }
        const fg = doc.categoryFields.get ? doc.categoryFields.get("Finished Goods") : (doc.categoryFields["Finished Goods"] || []);
        if (fg && !fg.includes("group")) {
          fg.push("group");
          if (doc.categoryFields.set) {
            doc.categoryFields.set("Finished Goods", fg);
          } else {
            doc.categoryFields["Finished Goods"] = fg;
          }
          docUpdated = true;
        }
      }
      if (docUpdated) {
        doc.markModified("groups");
        doc.markModified("categoryFields");
        await doc.save();
      }
    }
    res.json(doc);
  } catch (err) {
    next(err);
  }
};

exports.updateMetadata = async (req, res, next) => {
  try {
    const { companyId, units, categories, ruleTypes, groups, brands, categoryFields } = req.body;
    if (!companyId) {
      return res.status(400).json({ msg: "companyId is required" });
    }
    const companyObjId = toObjectId(companyId);
    let doc = await Metadata.findOne({ company: companyObjId });
    if (!doc) {
      doc = new Metadata({ company: companyObjId });
    }
    if (units) doc.units = units;
    if (categories) doc.categories = categories;
    if (ruleTypes) doc.ruleTypes = ruleTypes;
    if (groups) doc.groups = groups;
    if (brands) doc.brands = brands;
    if (categoryFields) doc.categoryFields = categoryFields;
    await doc.save();
    res.json(doc);
  } catch (err) {
    next(err);
  }
};
