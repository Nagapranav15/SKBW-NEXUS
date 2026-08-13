const mongoose = require("mongoose");
const SkuV2 = require("../models/skuV2Model");
const WarehouseLocationV2 = require("../models/warehouseLocationV2Model");
const InventoryLedgerV2 = require("../models/inventoryLedgerV2Model");
const InventoryLedger = require("../models/inventoryLedgerModelV2");
const Sequence = require("../models/sequenceModel");
const Metadata = require("../models/metadataModel");
const ActivityLog = require("../models/activityLogModel");

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
    if (req.query.showDeleted === "true") {
      query.isDeleted = true;
    } else {
      query.isDeleted = { $ne: true };
    }
    if (category) {
      query.category = category;
    }
    if (status) {
      query.status = status;
    }
    if (search) {
      const q = search.trim();
      const regexSearch = { $regex: q, $options: "i" };
      query.$or = [
        { skuCode: regexSearch },
        { name: regexSearch },
        { brand: regexSearch },
        { category: regexSearch },
        { group: regexSearch },
        { ruleType: regexSearch },
        { paperType: regexSearch },
        { unit: regexSearch },
        { altUnit: regexSearch }
      ];

      // Try parsing dimension format like "54 x 78" or "54x78" or "54 * 78"
      const dimensionMatch = q.match(/^(\d+(?:\.\d+)?)\s*[xX\*]\s*(\d+(?:\.\d+)?)$/);
      if (dimensionMatch) {
        const w = Number(dimensionMatch[1]);
        const l = Number(dimensionMatch[2]);
        if (!isNaN(w) && !isNaN(l)) {
          query.$or.push({ $and: [{ width: w }, { length: l }] });
        }
      } else {
        // Try parsing single number
        const parsedNum = Number(q);
        if (!isNaN(parsedNum)) {
          query.$or.push({ gsm: parsedNum });
          query.$or.push({ pages: parsedNum });
          query.$or.push({ width: parsedNum });
          query.$or.push({ length: parsedNum });
        }
      }
    }

    const skus = await SkuV2.find(query).sort({ createdAt: -1 });
    res.json(skus);
  } catch (err) {
    next(err);
  }
};

exports.createSku = async (req, res, next) => {
  try {
    const { skuCode, name, category, unit, altUnit, altUnitConversion, paperType, gsm, width, length, brand, title, group, ruleType, pages, booksGbl, openingStock, status, company } = req.body;
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
      openingStock: openingStock ? Number(openingStock) : 0,
      status: status || "Active",
      company: toObjectId(company),
      createdBy: req.user?.id ? toObjectId(req.user.id) : undefined
    });

    await newSku.save();
    ActivityLog.create({
      action: "CREATE",
      entityType: "SkuV2",
      entityName: newSku.skuCode,
      details: `SKU Item '${newSku.name}' (${newSku.skuCode}) was created.`,
      performedBy: req.user ? (req.user.fullName || req.user.email) : "System",
      company: toObjectId(company)
    }).catch(e => console.error("ActivityLog error:", e));
    res.status(201).json(newSku);
  } catch (err) {
    next(err);
  }
};

exports.updateSku = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { skuCode, name, category, unit, altUnit, altUnitConversion, paperType, gsm, width, length, brand, title, group, ruleType, pages, booksGbl, openingStock, status, company } = req.body;
    
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

    const changes = [];
    if (sku.name !== name) changes.push(`Name: '${sku.name}' → '${name}'`);
    if (sku.skuCode !== skuCode) changes.push(`Code: '${sku.skuCode}' → '${skuCode}'`);
    if (sku.category !== category) changes.push(`Category: '${sku.category}' → '${category}'`);
    if (sku.unit !== unit) changes.push(`Unit: '${sku.unit}' → '${unit}'`);
    if (sku.gsm !== (gsm ? Number(gsm) : undefined)) changes.push(`GSM: '${sku.gsm || ''}' → '${gsm || ''}'`);
    if (sku.width !== (width ? Number(width) : undefined)) changes.push(`Width: '${sku.width || ''}' → '${width || ''}'`);
    if (sku.brand !== (brand || "")) changes.push(`Brand: '${sku.brand || ''}' → '${brand || ''}'`);
    if (sku.status !== (status || "Active")) changes.push(`Status: '${sku.status}' → '${status}'`);
    if (sku.openingStock !== (openingStock !== undefined ? Number(openingStock) : sku.openingStock)) {
      changes.push(`Opening Stock: '${sku.openingStock}' → '${openingStock}'`);
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
    sku.openingStock = openingStock !== undefined ? Number(openingStock) : sku.openingStock;
    sku.status = status || "Active";
    if (req.body.isDeleted !== undefined) {
      sku.isDeleted = req.body.isDeleted;
    } else if (status === "Active") {
      sku.isDeleted = false;
    }

    await sku.save();

    ActivityLog.create({
      action: "UPDATE",
      entityType: "SkuV2",
      entityName: sku.skuCode,
      details: changes.length > 0 ? `Updated SKU '${sku.name}': ${changes.join(', ')}` : `Updated SKU '${sku.name}' specifications.`,
      performedBy: req.user ? (req.user.fullName || req.user.email) : "System",
      company: toObjectId(company)
    }).catch(e => console.error("ActivityLog error:", e));

    res.json(sku);
  } catch (err) {
    next(err);
  }
};

exports.deleteSku = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { companyId, permanent } = req.query;

    if (!companyId) {
      return res.status(400).json({ msg: "companyId query parameter is required" });
    }

    const skuObjId = toObjectId(id);
    const companyObjId = toObjectId(companyId);

    const sku = await SkuV2.findOne({ _id: skuObjId, company: companyObjId });
    if (!sku) {
      return res.status(404).json({ msg: "SKU not found" });
    }

    if (permanent === "true") {
      const count = await InventoryLedgerV2.countDocuments({ skuId: skuObjId, company: companyObjId });
      if (count > 0) {
        return res.status(400).json({ 
          msg: `Cannot permanently delete SKU '${sku.skuCode}' because it has active inventory ledger history.` 
        });
      }
      await SkuV2.deleteOne({ _id: skuObjId });

      ActivityLog.create({
        action: "PERMANENT_DELETE",
        entityType: "SkuV2",
        entityName: sku.skuCode,
        details: `Permanently deleted SKU '${sku.name}' (${sku.skuCode}).`,
        performedBy: req.user ? (req.user.fullName || req.user.email) : "System",
        company: companyObjId
      }).catch(e => console.error("ActivityLog error:", e));

      return res.json({ msg: "SKU permanently deleted successfully" });
    }

    sku.isDeleted = true;
    sku.status = "Inactive";
    await sku.save();

    ActivityLog.create({
      action: "DELETE",
      entityType: "SkuV2",
      entityName: sku.skuCode,
      details: `Moved SKU '${sku.name}' (${sku.skuCode}) to recycle bin.`,
      performedBy: req.user ? (req.user.fullName || req.user.email) : "System",
      company: companyObjId
    }).catch(e => console.error("ActivityLog error:", e));

    res.json({ msg: "SKU moved to recycle bin successfully" });
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
    const bulkOps = [];
    const skipped = [];

    for (const item of skus) {
      if (!item.skuCode || !item.name || !item.category || !item.unit) {
        skipped.push({ code: item.skuCode || "N/A", reason: "Missing required fields (Code/Name/Category/Unit)" });
        continue;
      }

      const updateData = {
        skuCode: item.skuCode,
        name: item.name,
        category: item.category,
        paperType: item.paperType || "None",
        unit: item.unit,
        altUnit: item.altUnit || undefined,
        altUnitConversion: item.altUnitConversion ? Number(item.altUnitConversion) : undefined,
        gsm: item.gsm ? Number(item.gsm) : undefined,
        width: item.width ? Number(item.width) : undefined,
        length: item.length ? Number(item.length) : undefined,
        brand: item.brand || "",
        ruleType: item.ruleType,
        pages: item.pages ? Number(item.pages) : undefined,
        reamWeight: item.reamWeight ? Number(item.reamWeight) : undefined,
        booksGbl: item.booksGbl ? Number(item.booksGbl) : undefined,
        openingStock: item.openingStock !== undefined ? Number(item.openingStock) : 0,
        status: item.status || "Active",
        company: companyObjId,
        createdBy: req.user?.id ? toObjectId(req.user.id) : undefined
      };

      bulkOps.push({
        updateOne: {
          filter: { skuCode: item.skuCode, company: companyObjId },
          update: { $set: updateData },
          upsert: true
        }
      });
    }

    let createdCount = 0;
    let modifiedCount = 0;

    if (bulkOps.length > 0) {
      const result = await SkuV2.bulkWrite(bulkOps);
      createdCount = result.upsertedCount || 0;
      modifiedCount = result.modifiedCount || 0;
    }

    const totalProcessed = createdCount + modifiedCount;

    if (totalProcessed > 0) {
      ActivityLog.create({
        action: "IMPORT",
        entityType: "SkuV2",
        entityName: "Bulk Import",
        details: `Bulk imported ${totalProcessed} SKUs (${createdCount} created, ${modifiedCount} updated).`,
        performedBy: req.user ? (req.user.fullName || req.user.email) : "System",
        company: companyObjId
      }).catch(e => console.error("ActivityLog error:", e));
    }

    res.json({
      msg: `Bulk import completed: ${createdCount} created, ${modifiedCount} updated.`,
      importedCount: totalProcessed,
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
    const { companyId, skuId, locationId, transactionType, batchNumber, startDate, endDate, excludeType } = req.query;
    if (!companyId) {
      return res.status(400).json({ msg: "companyId query parameter is required" });
    }

    const query = { company: toObjectId(companyId) };
    if (skuId) query.skuId = toObjectId(skuId);
    if (locationId) query.locationId = toObjectId(locationId);
    if (transactionType) query.transactionType = transactionType;
    if (excludeType) query.transactionType = { $ne: excludeType };
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
    const { skuId, fromLocationId, toLocationId, quantity, remarks, company, batchNumber, reels } = req.body;
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
    // Bypassed destination capacity limit constraint verification per user request

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
    const transactionNumberOut = await Sequence.getNextSequence("IL", session);
    const transactionNumberIn = await Sequence.getNextSequence("IL", session);

    // 1. OUT entry at source in primary ledger
    const primOut = new InventoryLedger({
      transactionNumber: transactionNumberOut,
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
      reels: reels || [],
      remarks: remarks || `Transfer to ${destLocation.name}`,
      createdBy: toObjectId(req.user.id),
      company: companyObjId,
      status: "Posted"
    });
    await primOut.save({ session });

    // 2. IN entry at destination in primary ledger
    const primIn = new InventoryLedger({
      transactionNumber: transactionNumberIn,
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
      reels: reels || [],
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
      batchNumber,
      reels,
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
      batchNumber,
      reels,
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
    const { companyId, category, groupByBatch, skuId, batchNumber } = req.query;
    if (!companyId) {
      return res.status(400).json({ msg: "companyId query parameter is required" });
    }

    const isGroupBatch = groupByBatch === 'true';
    const groupFields = isGroupBatch
      ? { skuId: "$skuId", locationId: "$locationId", batchNumber: "$batchNumber" }
      : { skuId: "$skuId", locationId: "$locationId" };

    const matchObj = { company: toObjectId(companyId) };
    if (skuId) matchObj.skuId = toObjectId(skuId);
    if (batchNumber) matchObj.batchNumber = batchNumber;

    const pipeline = [
      { $match: matchObj },
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
          reelsIn: {
            $push: {
              $cond: [{ $eq: ["$direction", "IN"] }, "$reels", []]
            }
          },
          reelsOut: {
            $push: {
              $cond: [{ $eq: ["$direction", "OUT"] }, "$reels", []]
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
    const { companyId, skuId, locationId, transactionType, direction, startDate, endDate, referenceId, search, excludeType, page = 1, limit = 20 } = req.query;
    if (!companyId) {
      return res.status(400).json({ msg: "companyId query parameter is required" });
    }

    const query = { company: toObjectId(companyId) };
    if (skuId) query.skuId = toObjectId(skuId);
    if (locationId) query.locationId = toObjectId(locationId);
    if (transactionType) query.transactionType = transactionType;
    if (excludeType) query.transactionType = { $ne: excludeType };
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

    const transactionNumber = await Sequence.getNextSequence("IL");

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
