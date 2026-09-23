const mongoose = require("mongoose");
const SkuV2 = require("../models/skuV2Model");
const WarehouseLocationV2 = require("../models/warehouseLocationV2Model");
const InventoryLedgerV2 = require("../models/inventoryLedgerV2Model");
const InventoryLedger = require("../models/inventoryLedgerModelV2");
const Sequence = require("../models/sequenceModel");
const Metadata = require("../models/metadataModel");
const ActivityLog = require("../models/activityLogModel");
const User = require("../models/userModel");
const SalesOrderV2 = require("../models/salesOrderV2Model");
const PurchaseInvoiceV2 = require("../models/purchaseInvoiceV2Model");
const { validateUomConversion } = require("../utils/uomConversion");

const toObjectId = (id) => {
  if (!id) return null;
  if (typeof id === 'object') {
    if (id._id) id = id._id;
    else if (id.id) id = id.id;
  }
  try {
    return new mongoose.Types.ObjectId(String(id));
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

    const skus = await SkuV2.find(query).sort({ skuCode: 1, createdAt: 1 });
    res.json(skus);
  } catch (err) {
    next(err);
  }
};

async function ensureDefaultWarehouseLocations(companyId) {
  const companyObjId = toObjectId(companyId);
  if (!companyObjId) return null;

  let locations = await WarehouseLocationV2.find({ company: companyObjId });
  if (locations.length > 0) {
    const factory = locations.find(l => l.level === "Factory") || locations[0];
    const floor = locations.find(l => l.level === "Floor" && (!factory || String(l.parentId) === String(factory._id))) || locations[0];
    const zone = locations.find(l => l.level === "Zone" && (!floor || String(l.parentId) === String(floor._id))) || locations[0];
    const storageLoc = locations.find(l => l.level === "Storage Location" && (!zone || String(l.parentId) === String(zone._id))) || locations[locations.length - 1];
    return { factory, floor, zone, storageLoc, all: locations };
  }

  // Create default hierarchy: SKBW -> Ground Floor -> Main Storage Zone -> Bay A1
  const factory = await WarehouseLocationV2.create({
    name: "SKBW",
    level: "Factory",
    parentId: null,
    capacity: 1000000,
    unit: "kg",
    status: "Active",
    company: companyObjId
  });

  const floor = await WarehouseLocationV2.create({
    name: "Ground Floor",
    level: "Floor",
    parentId: factory._id,
    capacity: 500000,
    unit: "kg",
    status: "Active",
    company: companyObjId
  });

  const zone = await WarehouseLocationV2.create({
    name: "Main Storage Zone",
    level: "Zone",
    parentId: floor._id,
    capacity: 250000,
    unit: "kg",
    status: "Active",
    company: companyObjId
  });

  const storageLoc = await WarehouseLocationV2.create({
    name: "Bay A1",
    level: "Storage Location",
    parentId: zone._id,
    capacity: 100000,
    unit: "kg",
    status: "Active",
    company: companyObjId
  });

  return { factory, floor, zone, storageLoc, all: [factory, floor, zone, storageLoc] };
}

exports.getNextSkuCode = async (req, res, next) => {
  try {
    const { companyId, prefix = "FG" } = req.query;
    if (!companyId) {
      return res.status(400).json({ msg: "companyId query parameter is required" });
    }

    const cleanPrefix = String(prefix).trim().toUpperCase();
    const companyObjId = toObjectId(companyId);

    // 1. Query ALL SKUs (active AND deleted) for this company to determine current highest sequential number
    const allCompanySkus = await SkuV2.find({ 
      company: companyObjId 
    }).select("skuCode isDeleted");

    let maxNum = 0;
    // Standard sequence regex: e.g. FG-001, RM-006, SM-002 (1 to 4 digits, <= 9999)
    const seqRegex = new RegExp(`^${cleanPrefix}-(\\d{1,4})$`, "i");

    for (const s of allCompanySkus) {
      const code = (s.skuCode || "").trim();
      const match = code.match(seqRegex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > 0 && num < 10000 && num > maxNum) {
          maxNum = num;
        }
      }
    }

    // 2. Check persistent Sequence counter if higher (only valid sequence numbers < 10000)
    const seqDoc = await Sequence.findOne({ prefix: `${companyId}_SKU_${cleanPrefix}` });
    if (seqDoc && typeof seqDoc.sequence === "number" && seqDoc.sequence > 0 && seqDoc.sequence < 10000) {
      if (seqDoc.sequence > maxNum) {
        maxNum = seqDoc.sequence;
      }
    }

    // 3. Ensure the generated code does not collide with ANY existing SKU for this company (active or deleted)
    let nextNum = maxNum + 1;
    let nextCode = `${cleanPrefix}-${String(nextNum).padStart(3, "0")}`;

    while (await SkuV2.exists({ company: companyObjId, skuCode: nextCode })) {
      nextNum++;
      nextCode = `${cleanPrefix}-${String(nextNum).padStart(3, "0")}`;
    }

    res.json({
      nextCode,
      nextSequence: nextNum,
      prefix: cleanPrefix
    });
  } catch (err) {
    next(err);
  }
};

exports.createSku = async (req, res, next) => {
  try {
    const { skuCode, name, category, unit, altUnit, altUnitConversion, altUnitDirection, paperType, gsm, width, length, brand, title, group, ruleType, pages, booksGbl, openingStock, minStockLevel, reorderLevel, preferredVendor, initialLocationId, defaultLocation, status, company } = req.body;
    if (!company) {
      return res.status(400).json({ msg: "company is required" });
    }

    if (altUnit) {
      const uomCheck = validateUomConversion(unit, altUnit, altUnitConversion);
      if (!uomCheck.valid) {
        return res.status(400).json({ msg: uomCheck.error });
      }
      if (uomCheck.isRedundant) {
        altUnit = "";
        altUnitConversion = undefined;
      }
    }

    const exists = await SkuV2.findOne({ skuCode, company: toObjectId(company) });
    if (exists) {
      if (exists.isDeleted) {
        return res.status(400).json({ 
          msg: `SKU Code '${skuCode}' was previously used by a deleted item and cannot be reused. Please use a new SKU Code.` 
        });
      }
      return res.status(400).json({ msg: `SKU Code '${skuCode}' already exists for this company` });
    }

    const defaultStructure = await ensureDefaultWarehouseLocations(company);
    const assignedLocation = initialLocationId || req.body.initialLocation || defaultLocation || "SKBW";
    const assignedLocationId = initialLocationId || (defaultStructure?.storageLoc?._id || defaultStructure?.factory?._id);

    const newSku = new SkuV2({
      skuCode,
      name,
      category,
      unit,
      altUnit,
      altUnitConversion: altUnitConversion ? Number(altUnitConversion) : undefined,
      altUnitDirection: altUnitDirection || undefined,
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
      presentStock: openingStock ? Number(openingStock) : 0,
      minStockLevel: minStockLevel !== undefined && minStockLevel !== null && minStockLevel !== '' ? Number(minStockLevel) : undefined,
      reorderLevel: reorderLevel !== undefined && reorderLevel !== null && reorderLevel !== '' ? Number(reorderLevel) : undefined,
      preferredVendor: preferredVendor || "",
      initialLocationId: typeof assignedLocationId === 'object' ? String(assignedLocationId._id || assignedLocationId) : String(assignedLocationId),
      initialLocation: typeof assignedLocation === 'object' ? (assignedLocation.name || "SKBW") : String(assignedLocation),
      defaultLocation: typeof assignedLocation === 'object' ? (assignedLocation.name || "SKBW") : String(assignedLocation),
      status: status || "Active",
      bomItems: req.body.bomItems || [],
      recipeYieldQty: req.body.recipeYieldQty !== undefined ? Number(req.body.recipeYieldQty) : (req.body.batchYieldQty !== undefined ? Number(req.body.batchYieldQty) : 1),
      recipeYieldUnit: req.body.recipeYieldUnit || req.body.batchYieldUnit || req.body.unit || "",
      batchYieldQty: req.body.batchYieldQty !== undefined ? Number(req.body.batchYieldQty) : (req.body.recipeYieldQty !== undefined ? Number(req.body.recipeYieldQty) : 1),
      batchYieldUnit: req.body.batchYieldUnit || req.body.recipeYieldUnit || req.body.unit || "",
      processSteps: req.body.processSteps || [],
      company: toObjectId(company),
      createdBy: req.user?.id ? toObjectId(req.user.id) : undefined
    });

    await newSku.save();

    // Permanently record sequence number so this SKU ID is never reused even if deleted
    const numMatch = (newSku.skuCode || '').match(/^([A-Z]+)-(\d{1,4})$/i);
    if (numMatch) {
      const p = numMatch[1].toUpperCase();
      const n = parseInt(numMatch[2], 10);
      if (!isNaN(n) && n > 0 && n < 10000) {
        await Sequence.findOneAndUpdate(
          { prefix: `${company}_SKU_${p}` },
          { $max: { sequence: n } },
          { upsert: true }
        ).catch(() => {});
      }
    }

    if (newSku.openingStock > 0 && defaultStructure) {
      try {
        const trxNo = await Sequence.getNextSequence("IL");
        await InventoryLedger.create({
          transactionNumber: trxNo,
          transactionType: "Opening Stock",
          skuId: newSku._id,
          quantity: newSku.openingStock,
          unit: newSku.unit || "kg",
          direction: "IN",
          referenceType: "OpeningStock",
          referenceId: `OPEN-${newSku.skuCode}`,
          batchNumber: `OPEN-${newSku.skuCode}`,
          warehouseId: defaultStructure.factory._id,
          floorId: defaultStructure.floor._id,
          zoneId: defaultStructure.zone._id,
          locationId: defaultStructure.storageLoc._id,
          remarks: "Initial opening stock assigned during item creation in SKBW",
          company: toObjectId(company),
          status: "Posted"
        });

        await InventoryLedgerV2.create({
          timestamp: new Date(),
          transactionType: "OPENING_BALANCE",
          referenceId: `OPEN-${newSku.skuCode}`,
          skuId: newSku._id,
          locationId: defaultStructure.storageLoc._id,
          qtyIn: newSku.openingStock,
          qtyOut: 0,
          balanceAfter: newSku.openingStock,
          remarks: "Initial opening stock assigned during item creation in SKBW",
          company: toObjectId(company),
          userId: req.user?.id ? toObjectId(req.user.id) : undefined
        });
      } catch (e) {
        console.error("Error creating opening stock ledger entry:", e);
      }
    }

    // Auto-sync units, ruleType, brand, category to company Metadata
    const cleanItemUnits = [newSku.unit, newSku.altUnit].filter(u => u && typeof u === 'string' && u.trim());
    const cleanItemRuleTypes = (newSku.ruleType && typeof newSku.ruleType === 'string' && newSku.ruleType.trim()) ? [newSku.ruleType.trim()] : [];
    const cleanItemBrands = (newSku.brand && typeof newSku.brand === 'string' && newSku.brand.trim()) ? [newSku.brand.trim()] : [];
    const cleanItemCategories = (newSku.category && typeof newSku.category === 'string' && newSku.category.trim()) ? [newSku.category.trim()] : [];

    if (cleanItemUnits.length > 0 || cleanItemRuleTypes.length > 0 || cleanItemBrands.length > 0 || cleanItemCategories.length > 0) {
      const metaUpdate = {};
      if (cleanItemUnits.length > 0) metaUpdate.units = { $each: cleanItemUnits };
      if (cleanItemRuleTypes.length > 0) metaUpdate.ruleTypes = { $each: cleanItemRuleTypes };
      if (cleanItemBrands.length > 0) metaUpdate.brands = { $each: cleanItemBrands };
      if (cleanItemCategories.length > 0) metaUpdate.categories = { $each: cleanItemCategories };

      await Metadata.findOneAndUpdate(
        { company: toObjectId(company) },
        { $addToSet: metaUpdate },
        { upsert: true }
      ).catch(() => {});
    }

    ActivityLog.create({
      action: "CREATE",
      entityType: "SkuV2",
      entityName: newSku.skuCode,
      details: `Created SKU '${newSku.name}' (${newSku.skuCode}) with initial location SKBW.`,
      performedBy: req.user ? (req.user.fullName || req.user.email) : "System",
      company: newSku.company
    }).catch(e => console.error("ActivityLog error:", e));
    res.status(201).json(newSku);
  } catch (err) {
    next(err);
  }
};

exports.updateSku = async (req, res, next) => {
  try {
    const { id } = req.params;
    const compId = req.body.company || req.query.companyId;

    const skuObjId = toObjectId(id);
    let sku = null;
    if (skuObjId) {
      sku = await SkuV2.findById(skuObjId);
    }
    if (!sku) {
      sku = await SkuV2.findOne({ _id: id });
    }
    if (!sku && compId) {
      const compObjId = toObjectId(compId);
      sku = await SkuV2.findOne({ 
        _id: skuObjId || id, 
        company: compObjId || compId 
      });
    }

    if (!sku) {
      return res.status(404).json({ msg: "SKU not found" });
    }

    const changes = [];
    if (req.body.name !== undefined && req.body.name !== sku.name) changes.push(`Name: '${sku.name}' → '${req.body.name}'`);
    if (req.body.skuCode !== undefined && req.body.skuCode !== sku.skuCode) changes.push(`Code: '${sku.skuCode}' → '${req.body.skuCode}'`);
    if (req.body.category !== undefined && req.body.category !== sku.category) changes.push(`Category: '${sku.category}' → '${req.body.category}'`);
    if (req.body.unit !== undefined && req.body.unit !== sku.unit) changes.push(`Unit: '${sku.unit}' → '${req.body.unit}'`);
    if (req.body.status !== undefined && req.body.status !== sku.status) changes.push(`Status: '${sku.status}' → '${req.body.status}'`);
    if (req.body.bomItems !== undefined) changes.push(`BOM Recipe updated (${req.body.bomItems.length} items)`);

    if (req.body.skuCode && req.body.skuCode !== sku.skuCode) {
      const exists = await SkuV2.findOne({ 
        skuCode: req.body.skuCode, 
        company: sku.company, 
        isDeleted: { $ne: true },
        _id: { $ne: toObjectId(id) || id } 
      });
      if (exists) {
        return res.status(400).json({ msg: `SKU Code '${req.body.skuCode}' already exists for this company` });
      }
      sku.skuCode = req.body.skuCode;
    }

    const targetUnit = req.body.unit !== undefined ? req.body.unit : sku.unit;
    const targetAltUnit = req.body.altUnit !== undefined ? req.body.altUnit : sku.altUnit;
    const targetConversion = req.body.altUnitConversion !== undefined ? req.body.altUnitConversion : sku.altUnitConversion;

    if (targetAltUnit) {
      const uomCheck = validateUomConversion(targetUnit, targetAltUnit, targetConversion);
      if (!uomCheck.valid) {
        return res.status(400).json({ msg: uomCheck.error });
      }
      if (uomCheck.isRedundant) {
        sku.altUnit = "";
        sku.altUnitConversion = undefined;
      }
    }

    const previousName = sku.name;
    const previousCode = sku.skuCode;

    if (req.body.name !== undefined && req.body.name !== null) sku.name = req.body.name;
    if (req.body.category !== undefined && req.body.category !== null) sku.category = req.body.category;
    if (req.body.unit !== undefined && req.body.unit !== null) sku.unit = req.body.unit;
    if (req.body.altUnit !== undefined) sku.altUnit = req.body.altUnit || "";
    if (req.body.altUnitConversion !== undefined) sku.altUnitConversion = req.body.altUnitConversion ? Number(req.body.altUnitConversion) : undefined;
    if (req.body.altUnitDirection !== undefined) sku.altUnitDirection = req.body.altUnitDirection || undefined;
    
    // Normalize paperType to schema enum ["Reels", "Sheets", "None"]
    if (req.body.paperType !== undefined) {
      const pt = String(req.body.paperType || '').trim().toLowerCase();
      if (pt === 'reels' || pt === 'reel') sku.paperType = 'Reels';
      else if (pt === 'sheets' || pt === 'sheet') sku.paperType = 'Sheets';
      else sku.paperType = 'None';
    }

    if (req.body.gsm !== undefined) sku.gsm = req.body.gsm !== null && req.body.gsm !== '' ? Number(req.body.gsm) : undefined;
    if (req.body.width !== undefined) sku.width = req.body.width !== null && req.body.width !== '' ? Number(req.body.width) : undefined;
    if (req.body.length !== undefined) sku.length = req.body.length !== null && req.body.length !== '' ? Number(req.body.length) : undefined;
    if (req.body.brand !== undefined) sku.brand = req.body.brand || "";
    if (req.body.title !== undefined) sku.title = req.body.title || "";
    if (req.body.group !== undefined) sku.group = req.body.group || "";
    if (req.body.ruleType !== undefined) sku.ruleType = req.body.ruleType || "";
    if (req.body.pages !== undefined) sku.pages = req.body.pages !== null && req.body.pages !== '' ? Number(req.body.pages) : undefined;
    if (req.body.booksGbl !== undefined) sku.booksGbl = req.body.booksGbl !== null && req.body.booksGbl !== '' ? Number(req.body.booksGbl) : undefined;
    if (req.body.openingStock !== undefined) sku.openingStock = req.body.openingStock !== undefined && req.body.openingStock !== null && req.body.openingStock !== '' ? Number(req.body.openingStock) : sku.openingStock;
    if (req.body.minStockLevel !== undefined) sku.minStockLevel = req.body.minStockLevel !== '' && req.body.minStockLevel !== null ? Number(req.body.minStockLevel) : undefined;
    if (req.body.reorderLevel !== undefined) sku.reorderLevel = req.body.reorderLevel !== '' && req.body.reorderLevel !== null ? Number(req.body.reorderLevel) : undefined;
    if (req.body.preferredVendor !== undefined) sku.preferredVendor = req.body.preferredVendor || "";
    if (req.body.initialLocationId !== undefined) {
      sku.initialLocationId = req.body.initialLocationId;
      sku.initialLocation = req.body.initialLocationId;
    }
    if (req.body.initialLocation !== undefined) {
      sku.initialLocation = req.body.initialLocation;
    }
    if (req.body.defaultLocation !== undefined) sku.defaultLocation = req.body.defaultLocation;
    
    // Normalize status to ["Active", "Inactive"]
    if (req.body.status !== undefined) {
      const st = String(req.body.status || '').trim().toLowerCase();
      sku.status = st === 'inactive' ? 'Inactive' : 'Active';
    }

    if (req.body.bomItems !== undefined) {
      sku.bomItems = Array.isArray(req.body.bomItems) ? req.body.bomItems : [];
      sku.markModified('bomItems');
    }
    if (req.body.recipeYieldQty !== undefined || req.body.batchYieldQty !== undefined) {
      const parsedQty = req.body.recipeYieldQty !== undefined ? Number(req.body.recipeYieldQty) : Number(req.body.batchYieldQty);
      sku.recipeYieldQty = !isNaN(parsedQty) && parsedQty > 0 ? parsedQty : 1;
      sku.batchYieldQty = sku.recipeYieldQty;
    }
    if (req.body.recipeYieldUnit !== undefined || req.body.batchYieldUnit !== undefined) {
      const u = req.body.recipeYieldUnit !== undefined ? req.body.recipeYieldUnit : req.body.batchYieldUnit;
      sku.recipeYieldUnit = u || "";
      sku.batchYieldUnit = sku.recipeYieldUnit;
    }

    // Process Steps support from processSteps, manufacturingSteps, or routing
    if (req.body.processSteps !== undefined) {
      sku.processSteps = Array.isArray(req.body.processSteps) ? req.body.processSteps : [];
      sku.markModified('processSteps');
    } else if (req.body.manufacturingSteps !== undefined) {
      sku.processSteps = Array.isArray(req.body.manufacturingSteps) ? req.body.manufacturingSteps : [];
      sku.markModified('processSteps');
    } else if (req.body.routing !== undefined) {
      sku.processSteps = Array.isArray(req.body.routing) ? req.body.routing : [];
      sku.markModified('processSteps');
    }

    if (req.body.isDeleted !== undefined) {
      sku.isDeleted = req.body.isDeleted;
    }

    await sku.save();

    // Dynamically update BOM recipes across all other SKUs referencing this item by ID, code, or name
    if (req.body.name !== undefined || req.body.skuCode !== undefined || req.body.unit !== undefined) {
      try {
        const skuIdStr = String(sku._id);
        const currentCode = sku.skuCode;
        const currentName = sku.name;
        const currentUnit = sku.unit || "Kg";

        const affectedSkus = await SkuV2.find({
          company: sku.company,
          "bomItems.0": { $exists: true }
        });

        for (const aff of affectedSkus) {
          let hasChange = false;
          const updatedBom = (aff.bomItems || []).map(b => {
            const bId = String(b.skuId || b.id || b._id || '');
            const bCode = (b.skuCode || '').trim().toUpperCase();
            const bName = (b.name || b.itemName || b.skuName || '').trim().toLowerCase();

            const isMatchingSku = 
              (bId && bId === skuIdStr) ||
              (bCode && (bCode === currentCode.toUpperCase() || (previousCode && bCode === previousCode.toUpperCase()))) ||
              (previousName && bName === previousName.trim().toLowerCase());

            if (isMatchingSku) {
              hasChange = true;
              return {
                ...b,
                skuId: sku._id,
                skuCode: currentCode,
                name: currentName,
                itemName: currentName,
                skuName: currentName,
                uom: currentUnit
              };
            }
            return b;
          });

          if (hasChange) {
            await SkuV2.updateOne({ _id: aff._id }, { $set: { bomItems: updatedBom } });
          }
        }
      } catch (bomSyncErr) {
        console.warn("Failed to cascade BOM item name update:", bomSyncErr);
      }
    }

    // Auto-sync units, ruleType, brand, category to company Metadata
    const cleanItemUnits = [sku.unit, sku.altUnit].filter(u => u && typeof u === 'string' && u.trim());
    const cleanItemRuleTypes = (sku.ruleType && typeof sku.ruleType === 'string' && sku.ruleType.trim()) ? [sku.ruleType.trim()] : [];
    const cleanItemBrands = (sku.brand && typeof sku.brand === 'string' && sku.brand.trim()) ? [sku.brand.trim()] : [];
    const cleanItemCategories = (sku.category && typeof sku.category === 'string' && sku.category.trim()) ? [sku.category.trim()] : [];

    if (cleanItemUnits.length > 0 || cleanItemRuleTypes.length > 0 || cleanItemBrands.length > 0 || cleanItemCategories.length > 0) {
      const metaUpdate = {};
      if (cleanItemUnits.length > 0) metaUpdate.units = { $each: cleanItemUnits };
      if (cleanItemRuleTypes.length > 0) metaUpdate.ruleTypes = { $each: cleanItemRuleTypes };
      if (cleanItemBrands.length > 0) metaUpdate.brands = { $each: cleanItemBrands };
      if (cleanItemCategories.length > 0) metaUpdate.categories = { $each: cleanItemCategories };

      await Metadata.findOneAndUpdate(
        { company: sku.company },
        { $addToSet: metaUpdate },
        { upsert: true }
      ).catch(() => {});
    }

    ActivityLog.create({
      action: "UPDATE",
      entityType: "SkuV2",
      entityName: sku.skuCode,
      details: changes.length > 0 ? `Updated SKU '${sku.name}': ${changes.join(', ')}` : `Updated SKU '${sku.name}' specifications.`,
      performedBy: req.user ? (req.user.fullName || req.user.email) : "System",
      company: sku.company
    }).catch(e => console.error("ActivityLog error:", e));

    res.json(sku);
  } catch (err) {
    next(err);
  }
};

exports.deleteSku = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { permanent } = req.query;

    const skuObjId = toObjectId(id) || id;

    // Find SKU by ID directly (works across all companies and ID formats)
    let sku = await SkuV2.findById(skuObjId);
    if (!sku) {
      sku = await SkuV2.findOne({ _id: id });
    }

    if (!sku) {
      return res.status(404).json({ msg: "SKU not found" });
    }

    const companyObjId = sku.company || req.query.companyId;

    // Stock check: If SKU currently holds positive stock, block deletion and alert user
    const ledgerAgg = await InventoryLedgerV2.aggregate([
      { $match: { skuId: sku._id } },
      { $group: { _id: "$skuId", totalIn: { $sum: "$qtyIn" }, totalOut: { $sum: "$qtyOut" } } }
    ]);
    const onHandStock = ledgerAgg.length > 0 ? ((ledgerAgg[0].totalIn || 0) - (ledgerAgg[0].totalOut || 0)) : (sku.openingStock || 0);
    if (onHandStock > 0) {
      return res.status(400).json({
        msg: `Cannot delete SKU '${sku.skuCode}' (${sku.name}) because it holds active stock (${onHandStock} ${sku.unit || 'units'}). Please adjust or transfer stock to 0 before deleting.`
      });
    }

    // Permanently record sequence number in Sequence collection so this SKU ID is never reused by new items
    const numMatch = (sku.skuCode || '').match(/^([A-Z]+)-(\d{1,4})$/i);
    if (numMatch) {
      const p = numMatch[1].toUpperCase();
      const n = parseInt(numMatch[2], 10);
      if (!isNaN(n) && n > 0 && n < 10000) {
        await Sequence.findOneAndUpdate(
          { prefix: `${companyObjId}_SKU_${p}` },
          { $max: { sequence: n } },
          { upsert: true }
        ).catch(() => {});
      }
    }

    if (permanent === "true") {
      const count = await InventoryLedgerV2.countDocuments({ skuId: sku._id });
      if (count > 0 && onHandStock !== 0) {
        return res.status(400).json({ 
          msg: `Cannot permanently delete SKU '${sku.skuCode}' because it has active inventory ledger history.` 
        });
      }
      await SkuV2.deleteOne({ _id: sku._id });

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

exports.bulkDeleteSkus = async (req, res, next) => {
  try {
    const { ids, companyId } = req.body;
    if (!companyId) {
      return res.status(400).json({ msg: "companyId is required" });
    }
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ msg: "No SKU ids provided" });
    }

    const companyObjId = toObjectId(companyId);
    const skuObjIds = ids.map(id => toObjectId(id));

    // Check stock for all requested SKUs
    const activeSkus = await SkuV2.find({ _id: { $in: skuObjIds }, company: companyObjId, isDeleted: { $ne: true } });
    const stockCheckAgg = await InventoryLedgerV2.aggregate([
      { $match: { skuId: { $in: activeSkus.map(s => s._id) } } },
      { $group: { _id: "$skuId", totalIn: { $sum: "$qtyIn" }, totalOut: { $sum: "$qtyOut" } } }
    ]);
    const stockMap = new Map();
    stockCheckAgg.forEach(row => {
      const net = (row.totalIn || 0) - (row.totalOut || 0);
      if (net > 0) stockMap.set(String(row._id), net);
    });

    const blockedSkus = activeSkus.filter(s => stockMap.has(String(s._id)));
    if (blockedSkus.length > 0) {
      const blockedList = blockedSkus.map(s => `'${s.skuCode}' (${stockMap.get(String(s._id))} ${s.unit})`).join(', ');
      return res.status(400).json({
        msg: `Cannot delete items with active stock: ${blockedList}. Please transfer or adjust stock to 0 first.`
      });
    }

    const result = await SkuV2.updateMany(
      { _id: { $in: skuObjIds }, company: companyObjId, isDeleted: { $ne: true } },
      { $set: { isDeleted: true, status: "Inactive" } }
    );

    ActivityLog.create({
      action: "BULK_DELETE",
      entityType: "SkuV2",
      entityName: `Bulk Delete (${ids.length} items)`,
      details: `Moved ${result.modifiedCount || ids.length} SKUs to recycle bin during bulk delete.`,
      performedBy: req.user ? (req.user.fullName || req.user.email) : "System",
      company: companyObjId
    }).catch(e => console.error("ActivityLog error:", e));

    res.json({
      msg: `Successfully moved ${result.modifiedCount || ids.length} items to recycle bin`,
      count: result.modifiedCount || ids.length
    });
  } catch (err) {
    next(err);
  }
};

exports.restoreSku = async (req, res, next) => {
  try {
    const { id } = req.params;
    const skuObjId = toObjectId(id) || id;
    const sku = await SkuV2.findById(skuObjId) || await SkuV2.findOne({ _id: id });
    if (!sku) {
      return res.status(404).json({ msg: "SKU not found" });
    }

    // Check if another active SKU exists with the exact same skuCode
    const duplicate = await SkuV2.findOne({
      skuCode: sku.skuCode,
      company: sku.company,
      isDeleted: false,
      _id: { $ne: sku._id }
    });

    if (duplicate) {
      return res.status(400).json({
        msg: `Cannot restore SKU: An active item with SKU Code '${sku.skuCode}' already exists.`
      });
    }

    sku.isDeleted = false;
    sku.status = "Active";
    await sku.save();

    ActivityLog.create({
      action: "RESTORE",
      entityType: "SkuV2",
      entityName: sku.skuCode,
      details: `Restored SKU '${sku.name}' (${sku.skuCode}) back to active inventory with original SKU ID.`,
      performedBy: req.user ? (req.user.fullName || req.user.email) : "System",
      company: sku.company
    }).catch(e => console.error("ActivityLog error:", e));

    res.json({ msg: `Restored item '${sku.skuCode}' to active inventory`, sku });
  } catch (err) {
    next(err);
  }
};

exports.clearRecycleBin = async (req, res, next) => {
  try {
    const { companyId } = req.body;
    if (!companyId) {
      return res.status(400).json({ msg: "companyId is required" });
    }
    const companyObjId = toObjectId(companyId);

    const deletedSkus = await SkuV2.find({ company: companyObjId, isDeleted: true });
    if (deletedSkus.length === 0) {
      return res.json({ msg: "Recycle bin is already empty", count: 0 });
    }

    const deletedIds = deletedSkus.map(s => s._id);
    await SkuV2.deleteMany({ _id: { $in: deletedIds } });

    ActivityLog.create({
      action: "PERMANENT_DELETE",
      entityType: "SkuV2",
      entityName: "Recycle Bin",
      details: `Permanently cleared ${deletedSkus.length} deleted items from Recycle Bin.`,
      performedBy: req.user ? (req.user.fullName || req.user.email) : "System",
      company: companyObjId
    }).catch(e => console.error("ActivityLog error:", e));

    res.json({ msg: `Successfully cleared ${deletedSkus.length} items from Recycle Bin`, count: deletedSkus.length });
  } catch (err) {
    next(err);
  }
};

exports.bulkUpdateSkus = async (req, res, next) => {
  try {
    const { ids, companyId, updates } = req.body;
    if (!companyId) {
      return res.status(400).json({ msg: "companyId is required" });
    }
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ msg: "No SKU ids provided" });
    }
    if (!updates || typeof updates !== "object") {
      return res.status(400).json({ msg: "No updates provided" });
    }

    const companyObjId = toObjectId(companyId);
    const skuObjIds = ids.map(id => toObjectId(id));

    const sanitizedUpdates = {};
    const allowedFields = [
      "status", "category", "group", "unit", "altUnit",
      "altUnitConversion", "altUnitDirection", "minStockLevel",
      "reorderLevel", "warehouseLocation", "leadTimeDays",
      "recipeYieldQty", "recipeYieldUnit", "batchYieldQty", "batchYieldUnit", "bomItems"
    ];

    for (const field of allowedFields) {
      if (updates[field] !== undefined && updates[field] !== "") {
        if (field === "minStockLevel" || field === "reorderLevel" || field === "altUnitConversion" || field === "leadTimeDays" || field === "recipeYieldQty" || field === "batchYieldQty") {
          const num = Number(updates[field]);
          if (!isNaN(num)) sanitizedUpdates[field] = num;
        } else {
          sanitizedUpdates[field] = updates[field];
        }
      }
    }

    if (Object.keys(sanitizedUpdates).length === 0) {
      return res.status(400).json({ msg: "No valid fields provided to update" });
    }

    const result = await SkuV2.updateMany(
      { _id: { $in: skuObjIds }, company: companyObjId, isDeleted: { $ne: true } },
      { $set: sanitizedUpdates }
    );

    ActivityLog.create({
      action: "BULK_UPDATE",
      entityType: "SkuV2",
      entityName: `Bulk Update (${ids.length} items)`,
      details: `Bulk updated fields: ${Object.keys(sanitizedUpdates).join(", ")} on ${result.modifiedCount || ids.length} SKUs`,
      performedBy: req.user ? (req.user.fullName || req.user.email) : "System",
      company: companyObjId
    }).catch(e => console.error("ActivityLog error:", e));

    res.json({
      msg: `Successfully updated ${result.modifiedCount || ids.length} items`,
      count: result.modifiedCount || ids.length,
      updatedFields: Object.keys(sanitizedUpdates)
    });
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
    const defaultStructure = await ensureDefaultWarehouseLocations(companyObjId);
    const defaultStorageLocId = String(defaultStructure?.storageLoc?._id || defaultStructure?.factory?._id);

    const bulkOps = [];
    const skipped = [];

    for (const item of skus) {
      if (!item.skuCode || !item.name || !item.category || !item.unit) {
        skipped.push({ code: item.skuCode || "N/A", reason: "Missing required fields (Code/Name/Category/Unit)" });
        continue;
      }

      // Never reuse SKU Code of a deleted item
      const existingDeleted = await SkuV2.findOne({ skuCode: item.skuCode, company: companyObjId, isDeleted: true });
      if (existingDeleted) {
        skipped.push({ code: item.skuCode, reason: `SKU Code '${item.skuCode}' was previously used by a deleted item and cannot be reused.` });
        continue;
      }

      // Track max sequence in Sequence collection
      const numMatch = (item.skuCode || '').match(/([A-Z]+)-(\d+)/i);
      if (numMatch) {
        const p = numMatch[1].toUpperCase();
        const n = parseInt(numMatch[2], 10);
        if (!isNaN(n)) {
          await Sequence.findOneAndUpdate(
            { prefix: `${company}_SKU_${p}` },
            { $max: { sequence: n } },
            { upsert: true }
          ).catch(() => {});
        }
      }

      const updateData = {
        skuCode: item.skuCode,
        name: item.name,
        category: item.category,
        paperType: item.paperType || "None",
        unit: item.unit,
        altUnit: item.altUnit || undefined,
        altUnitConversion: item.altUnitConversion ? Number(item.altUnitConversion) : undefined,
        altUnitDirection: item.altUnitDirection || undefined,
        gsm: item.gsm ? Number(item.gsm) : undefined,
        width: item.width ? Number(item.width) : undefined,
        length: item.length ? Number(item.length) : undefined,
        brand: item.brand || "",
        group: item.group || item.category || "",
        ruleType: item.ruleType,
        pages: item.pages ? Number(item.pages) : undefined,
        reamWeight: item.reamWeight ? Number(item.reamWeight) : undefined,
        booksGbl: item.booksGbl ? Number(item.booksGbl) : undefined,
        openingStock: item.openingStock !== undefined ? Number(item.openingStock) : 0,
        presentStock: item.openingStock !== undefined ? Number(item.openingStock) : 0,
        minStockLevel: item.minStockLevel !== undefined && item.minStockLevel !== null && item.minStockLevel !== '' ? Number(item.minStockLevel) : undefined,
        title: item.title || "",
        preferredVendor: item.preferredVendor || "",
        initialLocationId: defaultStorageLocId,
        initialLocation: "SKBW",
        defaultLocation: "SKBW",
        reorderLevel: item.reorderLevel !== undefined && item.reorderLevel !== null && item.reorderLevel !== '' ? Number(item.reorderLevel) : undefined,
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

      // Ensure opening stock ledger entries exist in SKBW
      if (defaultStructure) {
        const importedSkus = await SkuV2.find({ 
          company: companyObjId, 
          skuCode: { $in: skus.map(s => s.skuCode) },
          openingStock: { $gt: 0 }
        });

        for (const s of importedSkus) {
          const ledgerExists = await InventoryLedger.findOne({ 
            skuId: s._id, 
            referenceType: "OpeningStock" 
          });
          if (!ledgerExists) {
            const trxNo = await Sequence.getNextSequence("IL");
            await InventoryLedger.create({
              transactionNumber: trxNo,
              transactionType: "Opening Stock",
              skuId: s._id,
              quantity: s.openingStock,
              unit: s.unit || "kg",
              direction: "IN",
              referenceType: "OpeningStock",
              referenceId: `OPEN-${s.skuCode}`,
              batchNumber: `OPEN-${s.skuCode}`,
              warehouseId: defaultStructure.factory._id,
              floorId: defaultStructure.floor._id,
              zoneId: defaultStructure.zone._id,
              locationId: defaultStructure.storageLoc._id,
              remarks: "Imported initial opening stock in SKBW",
              company: companyObjId,
              status: "Posted"
            }).catch(e => console.error("Error creating opening stock ledger on import:", e));

            await InventoryLedgerV2.create({
              timestamp: new Date(),
              transactionType: "OPENING_BALANCE",
              referenceId: `OPEN-${s.skuCode}`,
              skuId: s._id,
              locationId: defaultStructure.storageLoc._id,
              qtyIn: s.openingStock,
              qtyOut: 0,
              balanceAfter: s.openingStock,
              remarks: "Imported initial opening stock in SKBW",
              company: companyObjId,
              userId: req.user?.id ? toObjectId(req.user.id) : undefined
            }).catch(e => console.error("Error creating InventoryLedgerV2 on import:", e));
          }
        }
      }
    }

    const totalProcessed = createdCount + modifiedCount;

    if (totalProcessed > 0) {
      // Auto-persist imported units, ruleTypes, brands, and categories to company Metadata
      const cleanFilter = (arr) => Array.from(new Set(
        (arr || [])
          .map(x => (typeof x === 'string' ? x.trim() : ''))
          .filter(x => x && x !== '-' && x !== '—' && x.toLowerCase() !== 'n/a' && x.toLowerCase() !== 'none' && x.toLowerCase() !== 'null' && x.toLowerCase() !== 'undefined')
      ));

      const importedUnits = cleanFilter(skus.flatMap(s => [s.unit, s.altUnit]));
      const importedRuleTypes = cleanFilter(skus.map(s => s.ruleType));
      const importedBrands = cleanFilter(skus.map(s => s.brand));
      const importedCategories = cleanFilter(skus.map(s => s.category));

      if (importedUnits.length > 0 || importedRuleTypes.length > 0 || importedBrands.length > 0 || importedCategories.length > 0) {
        const updateSetObj = {};
        if (importedUnits.length > 0) updateSetObj.units = { $each: importedUnits };
        if (importedRuleTypes.length > 0) updateSetObj.ruleTypes = { $each: importedRuleTypes };
        if (importedBrands.length > 0) updateSetObj.brands = { $each: importedBrands };
        if (importedCategories.length > 0) updateSetObj.categories = { $each: importedCategories };

        await Metadata.findOneAndUpdate(
          { company: companyObjId },
          { $addToSet: updateSetObj },
          { upsert: true }
        ).catch(err => console.error("Error auto-syncing metadata on bulk import:", err));
      }

      ActivityLog.create({
        action: "IMPORT",
        entityType: "SkuV2",
        entityName: "Bulk Import",
        details: `Bulk imported ${totalProcessed} SKUs (${createdCount} created, ${modifiedCount} updated) with default location SKBW.`,
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

exports.renumberSkus = async (req, res, next) => {
  try {
    const { companyId } = req.body;
    if (!companyId) {
      return res.status(400).json({ msg: "companyId is required" });
    }

    const companyObjId = toObjectId(companyId);
    const companyQuery = companyObjId ? { $in: [companyObjId, String(companyId)] } : companyId;
    
    // Fetch ALL SKUs for company (active + deleted)
    const companyAllSkus = await SkuV2.find({ company: companyQuery });
    
    // Collect all numbers ever used by deleted items so they are NEVER reused
    const deletedSkus = companyAllSkus.filter(s => s.isDeleted);
    const usedNumbersByPrefix = { FG: new Set(), SM: new Set(), RM: new Set() };
    for (const s of deletedSkus) {
      const match = (s.skuCode || '').match(/^([A-Z]+)-(\d+)/i);
      if (match) {
        const pref = match[1].toUpperCase();
        if (usedNumbersByPrefix[pref]) {
          usedNumbersByPrefix[pref].add(parseInt(match[2], 10));
        }
      }
    }

    const getSkuNum = (sku) => {
      const m = (sku.skuCode || '').match(/(\d+)/);
      return m ? parseInt(m[1], 10) : 999999;
    };
    const sortFn = (a, b) => {
      const numA = getSkuNum(a);
      const numB = getSkuNum(b);
      if (numA !== numB && numA !== 999999 && numB !== 999999) {
        return numA - numB;
      }
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    };

    const allSkus = companyAllSkus.filter(s => !s.isDeleted).sort(sortFn);

    if (!allSkus || allSkus.length === 0) {
      return res.json({ msg: "No SKUs to renumber", updatedCount: 0 });
    }

    const fgList = [];
    const smList = [];
    const rmList = [];

    for (const sku of allSkus) {
      const cat = (sku.category || "").trim().toLowerCase();
      const code = (sku.skuCode || "").trim().toUpperCase();
      const name = (sku.name || "").trim().toLowerCase();

      if (cat.includes("semi") || cat.includes("wip") || cat === "semi finished" || cat.includes("sub") || code.startsWith("SM") || code.startsWith("SEM") || code.startsWith("SFG") || name.includes("ruled cut") || name.includes("inner signature") || name.includes("book block")) {
        smList.push(sku);
      } else if (cat.includes("raw") || cat.includes("material") || cat === "raw material" || cat.includes("reel") || cat.includes("board") || code.startsWith("RM") || name.includes("reel") || name.includes("wire") || name.includes("adhesive") || name.includes("glue")) {
        rmList.push(sku);
      } else {
        // Products / Finished Goods
        fgList.push(sku);
      }
    }

    fgList.sort(sortFn);
    smList.sort(sortFn);
    rmList.sort(sortFn);

    // Pass 1: Set temporary codes for active company SKUs using bulkWrite to avoid unique index conflict
    const tempOps = allSkus.map((sku, idx) => ({
      updateOne: {
        filter: { _id: sku._id },
        update: { $set: { skuCode: `TEMP-RENUMBER-${idx + 1}-${Date.now()}-${String(sku._id).slice(-4)}` } }
      }
    }));
    if (tempOps.length > 0) {
      await SkuV2.bulkWrite(tempOps);
    }

    // Pass 2: Set clean continuous series numbers via bulkWrite skipping any number ever used by a deleted SKU
    const updateOps = [];

    function assignContinuousCodes(list, prefix) {
      let counter = 1;
      let maxAssigned = 0;
      list.forEach((sku) => {
        while (usedNumbersByPrefix[prefix] && usedNumbersByPrefix[prefix].has(counter)) {
          counter++;
        }
        updateOps.push({
          updateOne: {
            filter: { _id: sku._id },
            update: { $set: { skuCode: `${prefix}-${String(counter).padStart(3, "0")}` } }
          }
        });
        if (counter > maxAssigned) maxAssigned = counter;
        counter++;
      });
      return maxAssigned;
    }

    const maxFg = assignContinuousCodes(fgList, "FG");
    const maxSm = assignContinuousCodes(smList, "SM");
    const maxRm = assignContinuousCodes(rmList, "RM");

    let updatedCount = 0;
    if (updateOps.length > 0) {
      const resOps = await SkuV2.bulkWrite(updateOps);
      updatedCount = resOps.modifiedCount || updateOps.length;
    }

    ActivityLog.create({
      action: "UPDATE",
      entityType: "SkuV2",
      entityName: "Renumber Series",
      details: `Renumbered ${updatedCount} SKUs into continuous series without reusing deleted SKU numbers.`,
      performedBy: req.user ? (req.user.fullName || req.user.email) : "System",
      company: companyObjId
    }).catch(e => console.error("ActivityLog error:", e));

    // Update persistent sequence counters to reflect the maximum numbers
    if (companyId) {
      await Sequence.findOneAndUpdate(
        { prefix: `${companyId}_SKU_FG` },
        { $max: { sequence: maxFg } },
        { upsert: true }
      ).catch(() => {});
      await Sequence.findOneAndUpdate(
        { prefix: `${companyId}_SKU_SM` },
        { $max: { sequence: maxSm } },
        { upsert: true }
      ).catch(() => {});
      await Sequence.findOneAndUpdate(
        { prefix: `${companyId}_SKU_RM` },
        { $max: { sequence: maxRm } },
        { upsert: true }
      ).catch(() => {});
    }

    res.json({
      msg: `Successfully renumbered ${updatedCount} SKUs into continuous series`,
      updatedCount,
      fgCount: fgList.length,
      smCount: smList.length,
      rmCount: rmList.length
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

    const companyObjId = toObjectId(companyId);
    await ensureDefaultWarehouseLocations(companyObjId);
    const locations = await WarehouseLocationV2.find({ company: companyObjId }).lean();
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

    // 2. Check if location has any active stock or ledger movements
    const [ledgerCount1, ledgerCount2, stockCount] = await Promise.all([
      InventoryLedger.countDocuments({ locationId: locObjId, company: companyObjId, status: { $ne: "Cancelled" } }),
      InventoryLedgerV2.countDocuments({ locationId: locObjId, company: companyObjId }),
      InventoryLedger.aggregate([
        { $match: { locationId: locObjId, company: companyObjId, status: { $ne: "Cancelled" } } },
        { $group: { _id: null, qtyIn: { $sum: { $cond: [{ $eq: ["$direction", "IN"] }, "$quantity", 0] } }, qtyOut: { $sum: { $cond: [{ $eq: ["$direction", "OUT"] }, "$quantity", 0] } } } },
        { $project: { onHand: { $subtract: ["$qtyIn", "$qtyOut"] } } },
        { $match: { onHand: { $gt: 0.0001 } } }
      ])
    ]);

    if (stockCount.length > 0 && stockCount[0].onHand > 0.0001) {
      return res.status(400).json({
        msg: `Cannot delete location '${loc.name}' because it currently holds ${stockCount[0].onHand.toFixed(2)} units of stock. Please transfer all stock out first.`
      });
    }

    if (ledgerCount1 > 0 || ledgerCount2 > 0) {
      return res.status(400).json({
        msg: `Cannot delete location '${loc.name}' because it has active inventory transactions in the ledger. Please deactivate or set status to Maintenance.`
      });
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

    // Collect target location and all its descendant locations in the warehouse hierarchy
    const allCompanyLocations = await WarehouseLocationV2.find({ company: toObjectId(companyId) }).lean();
    const targetLocationIds = [location._id];
    const queue = [String(location._id)];
    const visited = new Set(queue);

    while (queue.length > 0) {
      const currentParentId = queue.shift();
      const children = allCompanyLocations.filter(loc => loc.parentId && String(loc.parentId) === currentParentId);
      for (const child of children) {
        const childIdStr = String(child._id);
        if (!visited.has(childIdStr)) {
          visited.add(childIdStr);
          targetLocationIds.push(child._id);
          queue.push(childIdStr);
        }
      }
    }

    const matchCondition = {
      company: toObjectId(companyId),
      status: { $ne: "Cancelled" },
      $or: [
        { locationId: { $in: targetLocationIds } },
        { zoneId: { $in: targetLocationIds } },
        { floorId: { $in: targetLocationIds } },
        { warehouseId: { $in: targetLocationIds } }
      ]
    };

    // Aggregate stored SKUs from ledger entries
    let ledgerAgg = await InventoryLedger.aggregate([
      { $match: matchCondition },
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
      { $match: { onHand: { $gt: 0.0001 } } }
    ]);

    // Fallback: If no records in InventoryLedger, check InventoryLedgerV2 (for legacy entries)
    if (ledgerAgg.length === 0) {
      const v2Agg = await InventoryLedgerV2.aggregate([
        {
          $match: {
            company: toObjectId(companyId),
            locationId: { $in: targetLocationIds }
          }
        },
        {
          $group: {
            _id: "$skuId",
            qtyInTotal: { $sum: "$qtyIn" },
            qtyOutTotal: { $sum: "$qtyOut" }
          }
        },
        {
          $project: {
            onHand: { $subtract: ["$qtyInTotal", "$qtyOutTotal"] }
          }
        },
        { $match: { onHand: { $gt: 0.0001 } } }
      ]);
      if (v2Agg.length > 0) {
        ledgerAgg = v2Agg;
      }
    }

    const storedSkuIds = ledgerAgg.map(a => a._id);
    const skus = await SkuV2.find({ _id: { $in: storedSkuIds } }).lean();

    const storedSkus = ledgerAgg.map(agg => {
      const matchSku = skus.find(s => String(s._id) === String(agg._id));
      return {
        sku: matchSku || { skuCode: "Unknown", name: "Unknown", category: "Unknown", unit: "Kg" },
        quantity: Math.round(agg.onHand * 1000) / 1000
      };
    });

    // Fetch recent movements inside this location / its descendants
    const recentMovements = await InventoryLedger.find(matchCondition)
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

    const matchObj = { 
      company: toObjectId(companyId), 
      status: { $ne: "Cancelled" },
      referenceType: { $ne: "OpeningStock" },
      transactionType: { $nin: ["Opening Stock", "Opening Balance", "OPENING_BALANCE"] }
    };
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
      { $match: { onHand: { $gt: 0.0001 } } },
      {
        $lookup: {
          localField: "skuId",
          from: SkuV2.collection.name,
          foreignField: "_id",
          as: "sku"
        }
      },
      { $unwind: { path: "$sku", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          localField: "locationId",
          from: WarehouseLocationV2.collection.name,
          foreignField: "_id",
          as: "location"
        }
      },
      { $unwind: { path: "$location", preserveNullAndEmptyArrays: true } }
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
          from: SkuV2.collection.name,
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
          from: SkuV2.collection.name,
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

const migrateLedgerTransactionNumbers = async (companyId) => {
  try {
    const query = companyId ? { company: companyId } : {};
    
    // Find only unmigrated entries that do not have a standardized TRX-MMM-XXX number
    const unmigrated = await InventoryLedger.find({
      ...query,
      $or: [
        { transactionNumber: { $exists: false } },
        { transactionNumber: null },
        { transactionNumber: { $not: /^TRX-[A-Z]{3}-\d+$/i } }
      ]
    }).sort({ createdAt: 1 });

    if (!unmigrated || unmigrated.length === 0) return;

    // Fetch all existing transaction numbers across all ledgers to guarantee zero collisions
    const allExisting = await InventoryLedger.find({}, { transactionNumber: 1 }).lean();
    const usedNumbers = new Set(allExisting.map(e => e.transactionNumber).filter(Boolean));

    // Determine current highest sequence number per month
    const monthCounters = {};
    for (const no of usedNumbers) {
      const match = String(no).match(/^TRX-([A-Z]{3})-(\d+)$/i);
      if (match) {
        const m = match[1].toUpperCase();
        const num = parseInt(match[2], 10);
        monthCounters[m] = Math.max(monthCounters[m] || 0, num);
      }
    }

    for (const entry of unmigrated) {
      const monthShort = entry.createdAt
        ? new Date(entry.createdAt).toLocaleString('en-US', { month: 'short' }).toUpperCase()
        : new Date().toLocaleString('en-US', { month: 'short' }).toUpperCase();

      let nextNum = (monthCounters[monthShort] || 0) + 1;
      let newNo = `TRX-${monthShort}-${String(nextNum).padStart(3, '0')}`;
      while (usedNumbers.has(newNo)) {
        nextNum++;
        newNo = `TRX-${monthShort}-${String(nextNum).padStart(3, '0')}`;
      }

      monthCounters[monthShort] = nextNum;
      usedNumbers.add(newNo);

      await InventoryLedger.updateOne(
        { _id: entry._id },
        { $set: { transactionNumber: newNo } }
      );
    }

    // Sync persistent Sequence model counter if current month has a higher sequence
    const curMonth = new Date().toLocaleString('en-US', { month: 'short' }).toUpperCase();
    if (monthCounters[curMonth]) {
      await Sequence.findOneAndUpdate(
        { prefix: "IL" },
        { $max: { sequence: monthCounters[curMonth] } },
        { upsert: true }
      ).catch(() => {});
      await Sequence.findOneAndUpdate(
        { prefix: "TRX" },
        { $max: { sequence: monthCounters[curMonth] } },
        { upsert: true }
      ).catch(() => {});
    }
  } catch (err) {
    console.error("Error migrating ledger transaction numbers:", err);
  }
};

exports.getLedgerEntries = async (req, res, next) => {
  try {
    const { companyId, skuId, locationId, transactionType, search, startDate, endDate, page = 1, limit = 20 } = req.query;
    if (!companyId) {
      return res.status(400).json({ msg: "companyId query parameter is required" });
    }

    const companyObjId = toObjectId(companyId);
    await migrateLedgerTransactionNumbers(companyObjId);

    const query = { company: companyObjId, status: { $ne: "Cancelled" } };
    if (skuId) query.skuId = toObjectId(skuId);
    if (locationId) query.locationId = toObjectId(locationId);
    if (transactionType) query.transactionType = transactionType;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    if (search) {
      query.$or = [
        { transactionNumber: { $regex: search, $options: "i" } },
        { batchNumber: { $regex: search, $options: "i" } },
        { referenceId: { $regex: search, $options: "i" } },
        { remarks: { $regex: search, $options: "i" } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    
    const [entries, total] = await Promise.all([
      InventoryLedger.find(query)
        .populate("skuId", "skuCode name category unit gsm brand ruleType width")
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

    const PurchaseInvoiceV2 = mongoose.model("PurchaseInvoiceV2");

    const formattedEntries = await Promise.all(entries.map(async (entryDoc) => {
      const entry = entryDoc.toObject();

      // Build full TO location hierarchy path
      const toParts = [];
      if (entry.warehouseId?.name) toParts.push(entry.warehouseId.name);
      if (entry.floorId?.name && entry.floorId.name !== entry.warehouseId?.name) toParts.push(entry.floorId.name);
      if (entry.zoneId?.name && entry.zoneId.name !== entry.floorId?.name) toParts.push(entry.zoneId.name);
      if (entry.locationId?.name) toParts.push(entry.locationId.name);
      
      const fullToPath = toParts.length > 0 ? toParts.join(' > ') : (entry.toLocationName || 'SKBW > Storage Area');
      entry.toLocationName = fullToPath;

      // Handle FROM location
      const isPurchase = entry.transactionType === 'Purchase' || entry.transactionType === 'PURCHASE' || (entry.direction === 'IN' && (entry.referenceType === 'PurchaseInvoice' || entry.referenceType === 'Purchase'));
      if (isPurchase) {
        let vendorName = '';
        const inv = await PurchaseInvoiceV2.findOne({
          $or: [
            { invoiceNumber: entry.batchNumber },
            { invoiceNumber: entry.referenceId }
          ]
        }).populate('vendorId', 'firmName ownerName').lean();

        if (inv && inv.vendorId) {
          vendorName = inv.vendorId.firmName || inv.vendorId.ownerName || '';
        }

        if (!vendorName) {
          if (entry.remarks && entry.remarks.includes('Bang Paper')) vendorName = 'Bang Paper';
          else if (entry.remarks && entry.remarks.includes('Barath')) vendorName = 'Barath Right Choice';
          else if (entry.remarks && entry.remarks.includes('Paper Mills')) vendorName = 'Paper Mills Supplier Ltd';
          else vendorName = 'Bang Paper';
        }

        entry.fromLocationName = `Supplier: ${vendorName}`;
      } else {
        let fullFromPath = entry.fromLocationName || 'SKBW > Ground > Asha > Bin A';
        if (entry.fromLocationId) {
          const fromLoc = await WarehouseLocationV2.findById(entry.fromLocationId).lean();
          if (fromLoc) {
            const fromZone = fromLoc.parentId ? await WarehouseLocationV2.findById(fromLoc.parentId).lean() : null;
            const fromFloor = fromZone?.parentId ? await WarehouseLocationV2.findById(fromZone.parentId).lean() : null;
            const fromWh = fromFloor?.parentId ? await WarehouseLocationV2.findById(fromFloor.parentId).lean() : null;
            const fromParts = [];
            if (fromWh?.name) fromParts.push(fromWh.name);
            if (fromFloor?.name && fromFloor.name !== fromWh?.name) fromParts.push(fromFloor.name);
            if (fromZone?.name && fromZone.name !== fromFloor?.name) fromParts.push(fromZone.name);
            if (fromLoc?.name) fromParts.push(fromLoc.name);
            if (fromParts.length > 0) fullFromPath = fromParts.join(' > ');
          }
        }
        entry.fromLocationName = fullFromPath;
      }

      return entry;
    }));

    res.json({
      entries: formattedEntries,
      total,
      page: Number(page),
      limit: Number(limit)
    });
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

    const companyObjId = toObjectId(companyId);
    await migrateLedgerTransactionNumbers(companyObjId);

    const query = { company: companyObjId, status: { $ne: "Cancelled" } };
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
        { batchNumber: { $regex: search, $options: "i" } },
        { referenceId: { $regex: search, $options: "i" } },
        { remarks: { $regex: search, $options: "i" } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    
    const [entries, total] = await Promise.all([
      InventoryLedger.find(query)
        .populate("skuId", "skuCode name category unit gsm brand ruleType width")
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

    const PurchaseInvoiceV2 = mongoose.model("PurchaseInvoiceV2");

    const formattedEntries = await Promise.all(entries.map(async (entryDoc) => {
      const entry = entryDoc.toObject();

      // Build full TO location hierarchy path
      const toParts = [];
      if (entry.warehouseId?.name) toParts.push(entry.warehouseId.name);
      if (entry.floorId?.name && entry.floorId.name !== entry.warehouseId?.name) toParts.push(entry.floorId.name);
      if (entry.zoneId?.name && entry.zoneId.name !== entry.floorId?.name) toParts.push(entry.zoneId.name);
      if (entry.locationId?.name) toParts.push(entry.locationId.name);
      
      const fullToPath = toParts.length > 0 ? toParts.join(' > ') : (entry.toLocationName || 'SKBW > Ground > Asha > Bottom');
      entry.toLocationName = fullToPath;

      // Handle FROM location
      const isPurchase = entry.transactionType === 'Purchase' || entry.transactionType === 'PURCHASE' || (entry.direction === 'IN' && (entry.referenceType === 'PurchaseInvoice' || entry.referenceType === 'Purchase'));
      if (isPurchase) {
        let vendorName = '';
        const inv = await PurchaseInvoiceV2.findOne({
          $or: [
            { invoiceNumber: entry.batchNumber },
            { invoiceNumber: entry.referenceId }
          ]
        }).populate('vendorId', 'firmName ownerName').lean();

        if (inv && inv.vendorId) {
          vendorName = inv.vendorId.firmName || inv.vendorId.ownerName || '';
        }

        if (!vendorName) {
          if (entry.remarks && entry.remarks.includes('Bang Paper')) vendorName = 'Bang Paper';
          else if (entry.remarks && entry.remarks.includes('Barath')) vendorName = 'Barath Right Choice';
          else if (entry.remarks && entry.remarks.includes('Paper Mills')) vendorName = 'Paper Mills Supplier Ltd';
          else vendorName = 'Bang Paper';
        }

        entry.fromLocationName = `Supplier: ${vendorName}`;
      } else {
        let fullFromPath = entry.fromLocationName || 'SKBW > Ground > Asha > Storage Bin A';
        if (entry.fromLocationId) {
          const fromLoc = await WarehouseLocationV2.findById(entry.fromLocationId).lean();
          if (fromLoc) {
            const fromZone = fromLoc.parentId ? await WarehouseLocationV2.findById(fromLoc.parentId).lean() : null;
            const fromFloor = fromZone?.parentId ? await WarehouseLocationV2.findById(fromZone.parentId).lean() : null;
            const fromWh = fromFloor?.parentId ? await WarehouseLocationV2.findById(fromFloor.parentId).lean() : null;
            const fromParts = [];
            if (fromWh?.name) fromParts.push(fromWh.name);
            if (fromFloor?.name && fromFloor.name !== fromWh?.name) fromParts.push(fromFloor.name);
            if (fromZone?.name && fromZone.name !== fromFloor?.name) fromParts.push(fromZone.name);
            if (fromLoc?.name) fromParts.push(fromLoc.name);
            if (fromParts.length > 0) fullFromPath = fromParts.join(' > ');
          }
        }
        entry.fromLocationName = fullFromPath;
      }

      return entry;
    }));

    res.json({
      entries: formattedEntries,
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
    if (!companyObjId) {
      return res.status(400).json({ msg: "Invalid companyId" });
    }
    let doc = await Metadata.findOne({ company: companyObjId });
    if (!doc) {
      doc = new Metadata({ 
        company: companyObjId,
        units: [],
        categories: ["products", "materials", "semi"],
        ruleTypes: [],
        groups: [],
        brands: [],
        categoryCards: [],
        standardizedSheets: []
      });
      await doc.save();
    }

    // Auto-discover any units, ruleTypes, brands, or categories from active SKUs in this company
    const [skuUnits, skuAltUnits, skuRuleTypes, skuBrands, skuCategories] = await Promise.all([
      SkuV2.distinct("unit", { company: companyObjId, isDeleted: false }),
      SkuV2.distinct("altUnit", { company: companyObjId, isDeleted: false }),
      SkuV2.distinct("ruleType", { company: companyObjId, isDeleted: false }),
      SkuV2.distinct("brand", { company: companyObjId, isDeleted: false }),
      SkuV2.distinct("category", { company: companyObjId, isDeleted: false })
    ]);

    const cleanFilter = (arr) => Array.from(new Set(
      (arr || [])
        .map(x => (typeof x === 'string' ? x.trim() : ''))
        .filter(x => x && x !== '-' && x !== '—' && x.toLowerCase() !== 'n/a' && x.toLowerCase() !== 'none' && x.toLowerCase() !== 'null' && x.toLowerCase() !== 'undefined')
    ));

    const combinedUnits = cleanFilter([...(doc.units || []), ...skuUnits, ...skuAltUnits]);
    const combinedRuleTypes = cleanFilter([...(doc.ruleTypes || []), ...skuRuleTypes]);
    const combinedBrands = cleanFilter([...(doc.brands || []), ...skuBrands]);
    const combinedCategories = cleanFilter([...(doc.categories || []), ...skuCategories]);

    // If new values were discovered from SKUs, persist them back to doc
    let shouldUpdate = false;
    if (combinedUnits.length !== (doc.units || []).length) {
      doc.units = combinedUnits;
      shouldUpdate = true;
    }
    if (combinedRuleTypes.length !== (doc.ruleTypes || []).length) {
      doc.ruleTypes = combinedRuleTypes;
      shouldUpdate = true;
    }
    if (combinedBrands.length !== (doc.brands || []).length) {
      doc.brands = combinedBrands;
      shouldUpdate = true;
    }
    if (shouldUpdate) {
      await Metadata.updateOne(
        { _id: doc._id },
        { $set: { units: combinedUnits, ruleTypes: combinedRuleTypes, brands: combinedBrands } }
      ).catch(() => {});
    }

    res.json(doc);
  } catch (err) {
    next(err);
  }
};

exports.updateMetadata = async (req, res, next) => {
  try {
    const { companyId, units, categories, ruleTypes, groups, brands, categoryFields, categoryCards, standardizedSheets } = req.body;
    if (!companyId) {
      return res.status(400).json({ msg: "companyId is required" });
    }
    const companyObjId = toObjectId(companyId);
    if (!companyObjId) {
      return res.status(400).json({ msg: "Invalid companyId" });
    }
    const updateObj = {};
    if (units !== undefined) updateObj.units = units;
    if (categories !== undefined) updateObj.categories = categories;
    if (ruleTypes !== undefined) updateObj.ruleTypes = ruleTypes;
    if (groups !== undefined) updateObj.groups = groups;
    if (brands !== undefined) updateObj.brands = brands;
    if (categoryFields !== undefined) updateObj.categoryFields = categoryFields;
    if (categoryCards !== undefined) updateObj.categoryCards = categoryCards;
    if (standardizedSheets !== undefined) updateObj.standardizedSheets = standardizedSheets;

    const doc = await Metadata.findOneAndUpdate(
      { company: companyObjId },
      { $set: updateObj },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
    );
    res.json(doc);
  } catch (err) {
    next(err);
  }
};

// ── STOCK ADJUSTMENT V2 ───────────────────────────────────────────────────────

exports.recordAdjustment = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { 
      skuId, 
      locationId, 
      adjustmentType,
      adjustmentQty,
      reason, 
      remarks, 
      company,
      batchNumber 
    } = req.body;

    if (!company) {
      return res.status(400).json({ msg: "company is required" });
    }
    if (!skuId || !locationId) {
      return res.status(400).json({ msg: "skuId and locationId are required" });
    }
    const diffQty = Number(adjustmentQty);
    if (isNaN(diffQty) || diffQty === 0) {
      return res.status(400).json({ msg: "Adjustment quantity must be non-zero" });
    }

    const companyObjId = toObjectId(company);
    const skuObjId = toObjectId(skuId);
    const locObjId = toObjectId(locationId);

    const skuDoc = await SkuV2.findOne({ _id: skuObjId, company: companyObjId });
    if (!skuDoc) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ msg: "SKU not found" });
    }

    const locationDoc = await WarehouseLocationV2.findOne({ _id: locObjId, company: companyObjId });
    if (!locationDoc) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ msg: "Location not found" });
    }

    const zone = await WarehouseLocationV2.findOne({ _id: locationDoc.parentId, company: companyObjId });
    const floor = zone ? await WarehouseLocationV2.findOne({ _id: zone.parentId, company: companyObjId }) : null;
    const warehouse = floor ? await WarehouseLocationV2.findOne({ _id: floor.parentId, company: companyObjId }) : null;

    const matchCriteria = { skuId: skuObjId, locationId: locObjId, company: companyObjId };
    if (batchNumber) matchCriteria.batchNumber = batchNumber;

    const currentLedgerAgg = await InventoryLedger.aggregate([
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
    const currentOnHand = currentLedgerAgg.length > 0 ? currentLedgerAgg[0].onHand : 0;
    const isIncrease = diffQty > 0;
    const absQty = Math.abs(diffQty);
    const newBalance = isIncrease ? currentOnHand + absQty : Math.max(0, currentOnHand - absQty);

    const referenceId = `ADJ-${Date.now()}`;
    const transactionNumber = await Sequence.getNextSequence("IL", session);

    // 1. Primary InventoryLedger
    const primAdj = new InventoryLedger({
      transactionNumber,
      transactionType: "Adjustment",
      skuId: skuObjId,
      quantity: absQty,
      unit: skuDoc.unit || "kg",
      direction: isIncrease ? "IN" : "OUT",
      referenceType: "StockAdjustment",
      referenceId,
      batchNumber: batchNumber || "UNKNOWN",
      warehouseId: warehouse?._id || locObjId,
      floorId: floor?._id || locObjId,
      zoneId: zone?._id || locObjId,
      locationId: locObjId,
      remarks: remarks || `Stock Adjustment (${adjustmentType || 'General'}): ${reason || 'Physical Count Reconciliation'}`,
      createdBy: toObjectId(req.user?.id),
      company: companyObjId,
      status: "Posted"
    });
    await primAdj.save({ session });

    // 2. V2 Audit Ledger
    const ledgerAdj = new InventoryLedgerV2({
      transactionType: "Stock Adjustment",
      referenceId,
      skuId: skuObjId,
      locationId: locObjId,
      qtyIn: isIncrease ? absQty : 0,
      qtyOut: isIncrease ? 0 : absQty,
      balanceAfter: newBalance,
      batchNumber: batchNumber || "UNKNOWN",
      company: companyObjId,
      remarks: `${adjustmentType || 'Adjustment'}: ${reason || ''} | ${remarks || ''}`.trim(),
      userId: toObjectId(req.user?.id)
    });
    await ledgerAdj.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      msg: "Stock adjustment recorded successfully",
      referenceId,
      previousBalance: currentOnHand,
      adjustmentQty: diffQty,
      newBalance
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

// ── SKU STOCK DETAILS COMMAND CENTER (5-TAB COMPLETE SNAPSHOT) ────────────────

exports.getSkuStockDetails = async (req, res, next) => {
  try {
    const { skuId } = req.params;
    const { companyId } = req.query;
    if (!skuId || !companyId) {
      return res.status(400).json({ msg: "skuId and companyId are required" });
    }

    const companyObjId = toObjectId(companyId);
    const skuObjId = toObjectId(skuId);

    let sku = null;
    if (skuObjId && companyObjId) {
      sku = await SkuV2.findOne({ _id: skuObjId, company: companyObjId });
    }
    if (!sku) {
      sku = await SkuV2.findById(skuObjId || skuId);
    }
    if (!sku) {
      return res.status(404).json({ msg: "SKU not found" });
    }

    // 1. Location Balances with full hierarchy
    const locationBalances = await InventoryLedger.aggregate([
      { $match: { skuId: skuObjId, company: companyObjId, status: { $ne: "Cancelled" } } },
      {
        $group: {
          _id: "$locationId",
          qtyIn: { $sum: { $cond: [{ $eq: ["$direction", "IN"] }, "$quantity", 0] } },
          qtyOut: { $sum: { $cond: [{ $eq: ["$direction", "OUT"] }, "$quantity", 0] } }
        }
      },
      {
        $project: {
          locationId: "$_id",
          onHand: { $subtract: ["$qtyIn", "$qtyOut"] }
        }
      },
      { $match: { onHand: { $gt: 0.0001 } } },
      {
        $lookup: {
          from: WarehouseLocationV2.collection.name,
          localField: "locationId",
          foreignField: "_id",
          as: "location"
        }
      },
      { $unwind: { path: "$location", preserveNullAndEmptyArrays: true } }
    ]);

    let populatedLocations = await Promise.all(
      locationBalances.map(async (lb) => {
        let locDoc = lb.location;
        if (!locDoc && lb.locationId) {
          locDoc = await WarehouseLocationV2.findById(lb.locationId).lean();
        }
        let zone = null, floor = null, warehouse = null;
        if (locDoc && locDoc.parentId) {
          zone = await WarehouseLocationV2.findById(locDoc.parentId).lean();
          if (zone && zone.parentId) {
            floor = await WarehouseLocationV2.findById(zone.parentId).lean();
            if (floor && floor.parentId) {
              warehouse = await WarehouseLocationV2.findById(floor.parentId).lean();
            }
          }
        }
        return {
          locationId: lb.locationId,
          locationName: locDoc ? locDoc.name : 'Main Storage',
          locationCode: locDoc ? locDoc.code : '',
          zoneName: zone ? zone.name : '',
          floorName: floor ? floor.name : '',
          warehouseName: warehouse ? warehouse.name : '',
          hierarchyPath: [warehouse?.name, floor?.name, zone?.name, locDoc?.name].filter(Boolean).join(' → '),
          onHand: lb.onHand,
          reserved: 0,
          available: lb.onHand,
          unitCost: Number(sku.costPrice || sku.rate || 0),
          stockValue: lb.onHand * Number(sku.costPrice || sku.rate || 0)
        };
      })
    );

    // If no active ledger balances, check if SKU has an assigned initial/default location
    if (populatedLocations.length === 0) {
      const assignedLocId = sku.initialLocationId || sku.initialLocation || sku.defaultLocation;
      if (assignedLocId) {
        let locDoc = null;
        if (mongoose.Types.ObjectId.isValid(String(assignedLocId))) {
          locDoc = await WarehouseLocationV2.findById(assignedLocId).lean();
        } else {
          locDoc = await WarehouseLocationV2.findOne({ name: String(assignedLocId).trim(), company: companyObjId }).lean();
        }
        if (locDoc) {
          let zone = null, floor = null, warehouse = null;
          if (locDoc.parentId) {
            zone = await WarehouseLocationV2.findById(locDoc.parentId).lean();
            if (zone && zone.parentId) {
              floor = await WarehouseLocationV2.findById(zone.parentId).lean();
              if (floor && floor.parentId) {
                warehouse = await WarehouseLocationV2.findById(floor.parentId).lean();
              }
            }
          }
          populatedLocations.push({
            locationId: locDoc._id,
            locationName: locDoc.name,
            locationCode: locDoc.code || '',
            zoneName: zone ? zone.name : '',
            floorName: floor ? floor.name : '',
            warehouseName: warehouse ? warehouse.name : '',
            hierarchyPath: [warehouse?.name, floor?.name, zone?.name, locDoc.name].filter(Boolean).join(' → '),
            onHand: 0,
            reserved: 0,
            available: 0,
            unitCost: Number(sku.costPrice || sku.rate || 0),
            stockValue: 0
          });
        }
      }
    }

    // 2. Batch Balances & Cost Layers
    const batchBalances = await InventoryLedger.aggregate([
      { $match: { skuId: skuObjId, company: companyObjId, status: { $ne: "Cancelled" } } },
      {
        $group: {
          _id: { batchNumber: "$batchNumber", locationId: "$locationId" },
          qtyIn: { $sum: { $cond: [{ $eq: ["$direction", "IN"] }, "$quantity", 0] } },
          qtyOut: { $sum: { $cond: [{ $eq: ["$direction", "OUT"] }, "$quantity", 0] } },
          firstInDate: { $min: { $cond: [{ $eq: ["$direction", "IN"] }, "$createdAt", null] } },
          referenceId: { $first: "$referenceId" },
          referenceType: { $first: "$referenceType" }
        }
      },
      {
        $project: {
          batchNumber: "$_id.batchNumber",
          locationId: "$_id.locationId",
          onHand: { $subtract: ["$qtyIn", "$qtyOut"] },
          firstInDate: 1,
          referenceId: 1,
          referenceType: 1
        }
      },
      { $match: { onHand: { $gt: 0.0001 } } },
      {
        $lookup: {
          from: WarehouseLocationV2.collection.name,
          localField: "locationId",
          foreignField: "_id",
          as: "location"
        }
      },
      { $unwind: { path: "$location", preserveNullAndEmptyArrays: true } }
    ]);

    const batchesWithCosting = await Promise.all(
      batchBalances.map(async (b, idx) => {
        let supplier = 'Direct Stock / Opening';
        let rate = Number(sku.costPrice || sku.rate || 0);
        let purchaseDate = b.firstInDate || new Date();
        let receivedQty = b.onHand;
        let reference = b.referenceId || `LOT-${idx + 1}`;

        if (b.batchNumber && b.batchNumber !== 'UNKNOWN') {
          const inv = await PurchaseInvoiceV2.findOne({
            company: companyObjId,
            "items.batchNumber": b.batchNumber
          }).select("invoiceNumber invoiceDate partyName items").lean();

          if (inv) {
            supplier = inv.partyName || supplier;
            purchaseDate = inv.invoiceDate || purchaseDate;
            reference = inv.invoiceNumber || reference;
            const matchedItem = inv.items?.find(it => it.batchNumber === b.batchNumber || String(it.skuId) === String(sku._id));
            if (matchedItem) {
              rate = matchedItem.rate || rate;
              receivedQty = matchedItem.quantity || receivedQty;
            }
          }
        }

        // Build short hierarchy path for location
        let locDoc = b.location;
        let zone = null, floor = null, warehouse = null;
        if (locDoc && locDoc.parentId) {
          zone = await WarehouseLocationV2.findById(locDoc.parentId).lean();
          if (zone && zone.parentId) {
            floor = await WarehouseLocationV2.findById(zone.parentId).lean();
            if (floor && floor.parentId) {
              warehouse = await WarehouseLocationV2.findById(floor.parentId).lean();
            }
          }
        }
        const shortLocPath = [warehouse?.name, floor?.name, zone?.name, locDoc?.name].filter(Boolean).join(' > ');

        return {
          id: `batch-${b.batchNumber || idx}`,
          batchNumber: b.batchNumber || `FG-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${idx + 1}`,
          reference: reference,
          locationId: b.locationId,
          locationName: locDoc ? locDoc.name : 'Main Storage',
          shortLocPath: shortLocPath || (locDoc ? locDoc.name : 'Main Storage'),
          receivedQty,
          remainingQty: b.onHand,
          rate: rate > 0 ? rate : Number(sku.costPrice || sku.rate || 250),
          value: b.onHand * (rate > 0 ? rate : Number(sku.costPrice || sku.rate || 250)),
          supplier: supplier,
          source: b.referenceType === 'Production' ? `Production ${b.referenceId}` : supplier,
          date: purchaseDate,
          status: 'Active'
        };
      })
    );

    // 3. Complete Company Locations Hierarchy Tree (Factory -> Floor -> Zone -> Storage Location)
    const allCompanyLocations = await WarehouseLocationV2.find({ company: companyObjId, status: { $ne: 'Inactive' } }).lean();
    
    // Group locations by parentId
    const locationMap = new Map();
    allCompanyLocations.forEach(loc => {
      locationMap.set(String(loc._id), { ...loc, children: [], onHand: 0, stockValue: 0, batchCount: 0, batches: [] });
    });

    // Attach batch stock to leaf locations
    batchesWithCosting.forEach(b => {
      if (b.locationId && locationMap.has(String(b.locationId))) {
        const loc = locationMap.get(String(b.locationId));
        loc.onHand += b.remainingQty;
        loc.stockValue += b.value;
        loc.batchCount += 1;
        loc.batches.push(b);
      }
    });

    // Roll up quantities up the hierarchy tree
    const rootLocations = [];
    allCompanyLocations.forEach(loc => {
      const node = locationMap.get(String(loc._id));
      if (loc.parentId && locationMap.has(String(loc.parentId))) {
        const parent = locationMap.get(String(loc.parentId));
        parent.children.push(node);
      } else {
        rootLocations.push(node);
      }
    });

    const rollupNode = (node) => {
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => rollupNode(child));
        node.onHand = node.children.reduce((sum, c) => sum + (c.onHand || 0), 0);
        node.stockValue = node.children.reduce((sum, c) => sum + (c.stockValue || 0), 0);
        node.batchCount = node.children.reduce((sum, c) => sum + (c.batchCount || 0), 0);
      }
    };
    rootLocations.forEach(root => rollupNode(root));

    // 4. Movements Ledger (chronological with running balances)
    const rawMovements = await InventoryLedger.find({
      skuId: skuObjId,
      company: companyObjId,
      status: { $ne: "Cancelled" }
    })
      .sort({ createdAt: 1 })
      .populate("locationId", "name code")
      .populate("warehouseId", "name")
      .populate("floorId", "name")
      .populate("zoneId", "name")
      .populate("createdBy", "name email")
      .lean();

    let runningBalance = 0;
    const movementsWithBalance = rawMovements.map((m, idx) => {
      const isIncoming = m.direction === "IN";
      const delta = isIncoming ? m.quantity : -m.quantity;
      runningBalance += delta;

      const rawType = m.transactionType || 'Stock Transfer';
      let normalizedType = rawType;
      let prefix = 'TRF';
      if (rawType.includes('Transfer')) {
        normalizedType = 'Stock Transfer';
        prefix = 'TRF';
      } else if (rawType.includes('Production') || rawType.includes('Purchase') || rawType.includes('Receipt')) {
        normalizedType = 'Production Receipt';
        prefix = 'PR';
      } else if (rawType.includes('Dispatch') || rawType.includes('Sales')) {
        normalizedType = 'Sales Dispatch';
        prefix = 'INV';
      } else if (rawType.includes('Reservation') || rawType.includes('Release')) {
        normalizedType = rawType.includes('Release') ? 'Stock Release' : 'Stock Reservation';
        prefix = 'SO';
      } else if (rawType.includes('Adjustment')) {
        normalizedType = 'Stock Adjustment';
        prefix = 'ADJ';
      } else if (rawType.includes('Opening') || rawType.includes('OPENING')) {
        normalizedType = 'Opening Stock';
        prefix = 'OPEN';
      }

      let refId = m.referenceId || '';
      if (!refId || !/^[A-Z]{2,4}-\d{3,5}$/.test(refId.trim())) {
        const digits = refId.replace(/\D/g, '');
        if (digits.length >= 4) {
          refId = `${prefix}-${digits.slice(-4)}`;
        } else if (digits.length > 0) {
          refId = `${prefix}-${digits.padStart(4, '0')}`;
        } else {
          refId = `${prefix}-${String(1000 + ((idx * 37) % 9000))}`;
        }
      }

      return {
        id: m._id,
        index: idx + 1,
        timestamp: m.createdAt || m.timestamp || new Date(),
        transactionType: normalizedType,
        direction: m.direction,
        referenceType: m.referenceType,
        referenceId: refId,
        fromLocation: isIncoming ? '-' : (m.locationId?.name || 'Main Storage'),
        toLocation: isIncoming ? (m.locationId?.name || 'Main Storage') : '-',
        locationName: m.locationId?.name || 'Main Storage',
        batchNumber: m.batchNumber || (batchesWithCosting[0]?.batchNumber || 'FG-BATCH-01'),
        qtyIn: isIncoming ? m.quantity : 0,
        qtyOut: !isIncoming ? m.quantity : 0,
        quantity: delta,
        runningBalance: Math.max(0, runningBalance),
        remarks: m.remarks || '',
        userName: m.createdBy?.name || 'System'
      };
    }).reverse(); // Most recent first for display

    // 5. Active Sales Order Reservations
    const activeOrders = await SalesOrderV2.find({
      company: companyObjId,
      status: { $in: ["Confirmed", "Processing", "Partially Dispatched", "Pending Dispatch", "Open", "Pending Allocation"] },
      "items.skuId": skuObjId
    }).lean();

    const reservations = [];
    let totalReserved = 0;

    activeOrders.forEach((order, idx) => {
      (order.items || []).forEach(item => {
        if (String(item.skuId) === String(skuObjId) || item.skuCode === sku.skuCode) {
          const orderedQty = item.quantity || 0;
          const dispatchedQty = item.dispatchedQty || 0;
          const remainingReserved = Math.max(0, orderedQty - dispatchedQty);
          const pendingQty = Math.max(0, orderedQty - remainingReserved - dispatchedQty);

          if (remainingReserved > 0 || pendingQty > 0 || orderedQty > 0) {
            totalReserved += remainingReserved;
            
            // Calculate days left from orderDate / requiredDate
            const reqDate = order.deliveryDate || order.orderDate || new Date();
            const daysDiff = Math.ceil((new Date(reqDate).getTime() - Date.now()) / (1000 * 3600 * 24));
            const daysLeftText = daysDiff > 0 ? `${daysDiff} days left` : daysDiff === 0 ? 'Today' : `${Math.abs(daysDiff)} days overdue`;

            reservations.push({
              id: `res-${order._id}-${idx}`,
              orderId: order._id,
              orderNumber: order.orderNumber || `SO-${1000 + idx}`,
              orderDate: order.orderDate,
              requiredDate: reqDate,
              daysLeftText,
              isOverdue: daysDiff < 0,
              customerName: order.customerName || order.partyName || 'Customer',
              orderedQty,
              reservedQty: remainingReserved,
              pendingQty: pendingQty > 0 ? pendingQty : Math.max(0, orderedQty - remainingReserved),
              dispatchedQty,
              status: remainingReserved > 0 && remainingReserved < orderedQty 
                ? 'Partially Reserved' 
                : remainingReserved >= orderedQty 
                  ? 'Reserved' 
                  : 'Pending Allocation'
            });
          }
        }
      });
    });

    // 6. Overall Totals & Valuation
    const onHandTotal = populatedLocations.reduce((sum, l) => sum + (l.onHand || 0), 0);
    const availableTotal = Math.max(0, onHandTotal - totalReserved);
    const totalBatchesVal = batchesWithCosting.reduce((sum, b) => sum + (b.value || 0), 0);
    const unitPrice = Number(sku.costPrice || sku.rate || (batchesWithCosting.length > 0 ? totalBatchesVal / onHandTotal : 0) || 0);
    const stockValue = totalBatchesVal > 0 ? totalBatchesVal : (onHandTotal * unitPrice);
    const avgRate = onHandTotal > 0 ? (stockValue / onHandTotal) : unitPrice;

    let pcsEquivalent = null;
    if (sku.altUnitConversion && Number(sku.altUnitConversion) > 0) {
      pcsEquivalent = onHandTotal * Number(sku.altUnitConversion);
    }

    res.json({
      sku,
      summary: {
        onHand: onHandTotal,
        reserved: totalReserved,
        available: availableTotal,
        inProcess: 0,
        stockValue,
        avgRate: Math.round(avgRate),
        pcsEquivalent,
        primaryUnit: sku.unit || 'GBL',
        altUnit: sku.altUnit || 'PCS',
        altUnitConversion: sku.altUnitConversion || 200
      },
      locations: populatedLocations,
      hierarchyTree: rootLocations,
      batches: batchesWithCosting,
      movements: movementsWithBalance,
      reservations
    });
  } catch (err) {
    next(err);
  }
};
