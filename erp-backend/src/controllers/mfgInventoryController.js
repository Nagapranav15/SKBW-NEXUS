const mongoose = require("mongoose");
const Factory = require("../models/factoryModel");
const Floor = require("../models/floorModel");
const Zone = require("../models/zoneModel");
const Sku = require("../models/skuModel");
const MfgMovement = require("../models/mfgMovementModel");
const Bom = require("../models/bomModel");

const toObjectId = (id) => new mongoose.Types.ObjectId(id);

// ─── FACTORIES ───
exports.getFactories = async (req, res) => {
  const f = {}; if (req.query.companyId) f.company = req.query.companyId;
  res.json(await Factory.find(f).sort({ name: 1 }));
};
exports.createFactory = async (req, res) => {
  try { res.status(201).json(await Factory.create(req.body)); }
  catch (e) { res.status(e.code === 11000 ? 409 : 500).json({ msg: e.code === 11000 ? "Factory code already exists" : e.message }); }
};
exports.updateFactory = async (req, res) => {
  const f = await Factory.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
  f ? res.json(f) : res.status(404).json({ msg: "Not found" });
};
exports.deleteFactory = async (req, res) => {
  const floors = await Floor.countDocuments({ factory_id: req.params.id });
  if (floors > 0) return res.status(400).json({ msg: "Cannot delete factory with floors. Remove floors first." });
  await Factory.findByIdAndDelete(req.params.id);
  res.json({ msg: "Deleted" });
};

// ─── FLOORS ───
exports.getFloors = async (req, res) => {
  const f = {}; if (req.query.companyId) f.company = req.query.companyId;
  if (req.query.factoryId) f.factory_id = req.query.factoryId;
  res.json(await Floor.find(f).populate("factory_id", "name code").sort({ createdAt: 1 }));
};
exports.createFloor = async (req, res) => {
  try { res.status(201).json(await Floor.create(req.body)); }
  catch (e) { res.status(e.code === 11000 ? 409 : 500).json({ msg: e.code === 11000 ? "Floor already exists" : e.message }); }
};
exports.updateFloor = async (req, res) => {
  const f = await Floor.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
  f ? res.json(f) : res.status(404).json({ msg: "Not found" });
};
exports.deleteFloor = async (req, res) => {
  const zones = await Zone.countDocuments({ floor_id: req.params.id });
  if (zones > 0) return res.status(400).json({ msg: "Cannot delete floor with zones. Remove zones first." });
  await Floor.findByIdAndDelete(req.params.id);
  res.json({ msg: "Deleted" });
};

// ─── ZONES ───
exports.getZones = async (req, res) => {
  const f = {}; if (req.query.companyId) f.company = req.query.companyId;
  if (req.query.floorId) f.floor_id = req.query.floorId;
  if (req.query.factoryId) f.factory_id = req.query.factoryId;
  res.json(await Zone.find(f).populate("floor_id", "name").populate("factory_id", "name code").sort({ zone_code: 1 }));
};
exports.createZone = async (req, res) => {
  try { res.status(201).json(await Zone.create(req.body)); }
  catch (e) { res.status(e.code === 11000 ? 409 : 500).json({ msg: e.code === 11000 ? "Zone code already exists" : e.message }); }
};
exports.updateZone = async (req, res) => {
  const z = await Zone.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
  z ? res.json(z) : res.status(404).json({ msg: "Not found" });
};
exports.deleteZone = async (req, res) => {
  const mv = await MfgMovement.countDocuments({ $or: [{ from_zone: req.params.id }, { to_zone: req.params.id }] });
  if (mv > 0) return res.status(400).json({ msg: "Cannot delete zone with movements" });
  await Zone.findByIdAndDelete(req.params.id);
  res.json({ msg: "Deleted" });
};

// ─── SKUs ───
exports.getSkus = async (req, res) => {
  const f = {}; if (req.query.companyId) f.company = req.query.companyId;
  if (req.query.category) f.category = req.query.category;
  if (req.query.status) f.status = req.query.status;
  res.json(await Sku.find(f).sort({ name: 1 }));
};
exports.createSku = async (req, res) => {
  try { res.status(201).json(await Sku.create(req.body)); }
  catch (e) { res.status(e.code === 11000 ? 409 : 500).json({ msg: e.code === 11000 ? "SKU code already exists" : e.message }); }
};
exports.updateSku = async (req, res) => {
  const s = await Sku.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
  s ? res.json(s) : res.status(404).json({ msg: "Not found" });
};
exports.deleteSku = async (req, res) => {
  await Sku.findByIdAndDelete(req.params.id);
  res.json({ msg: "Deleted" });
};

// ─── MOVEMENTS (stock auto-calculated) ───
exports.getMovements = async (req, res) => {
  const f = {}; if (req.query.companyId) f.company = req.query.companyId;
  if (req.query.type) f.type = req.query.type;
  if (req.query.skuId) f.sku = req.query.skuId;
  if (req.query.zoneId) f.$or = [{ from_zone: req.query.zoneId }, { to_zone: req.query.zoneId }];
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const skip = Number(req.query.skip) || 0;
  const [movements, total] = await Promise.all([
    MfgMovement.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate("sku", "sku_code name category unit_type")
      .populate("from_zone", "zone_code name").populate("to_zone", "zone_code name")
      .populate("createdBy", "fullName"),
    MfgMovement.countDocuments(f)
  ]);
  res.json({ movements, total });
};

exports.recordMovement = async (req, res) => {
  try {
    const { type, from_zone, to_zone, sku, quantity, unit, gsm_used, books_per_gbl, cost_per_unit, remarks, company } = req.body;
    if (!type || !sku || !quantity || quantity <= 0) return res.status(400).json({ msg: "type, sku, and positive quantity are required" });

    // Validate zone requirements
    if (type === "IN" && !to_zone) return res.status(400).json({ msg: "to_zone required for IN movement" });
    if (type === "OUT" && !from_zone) return res.status(400).json({ msg: "from_zone required for OUT movement" });
    if (type === "TRANSFER" && (!from_zone || !to_zone)) return res.status(400).json({ msg: "Both from_zone and to_zone required for TRANSFER" });

    // For OUT/TRANSFER, validate sufficient stock
    if (type === "OUT" || type === "TRANSFER") {
      const stock = await getZoneSkuStock(from_zone, sku, company);
      if (stock < quantity) return res.status(400).json({ msg: `Insufficient stock. Available: ${stock}, Requested: ${quantity}` });
    }

    const movement = await MfgMovement.create({
      type, from_zone: from_zone || null, to_zone: to_zone || null,
      sku, quantity, unit, gsm_used, books_per_gbl, cost_per_unit: cost_per_unit || 0,
      remarks: remarks || "", company, createdBy: req.user.id
    });

    const populated = await MfgMovement.findById(movement._id)
      .populate("sku", "sku_code name category unit_type")
      .populate("from_zone", "zone_code name").populate("to_zone", "zone_code name");

    res.status(201).json(populated);
  } catch (e) { res.status(500).json({ msg: e.message }); }
};

// ─── COMPUTED STOCK (from movements) ───
const getZoneSkuStock = async (zoneId, skuId, companyId) => {
  const pipeline = [
    { $match: { company: toObjectId(companyId), sku: toObjectId(skuId) } },
    { $match: { $or: [{ to_zone: toObjectId(zoneId) }, { from_zone: toObjectId(zoneId) }] } },
    { $group: {
      _id: null,
      total: { $sum: {
        $cond: [
          { $eq: ["$to_zone", toObjectId(zoneId)] },
          "$quantity",
          { $multiply: ["$quantity", -1] }
        ]
      }}
    }}
  ];
  const result = await MfgMovement.aggregate(pipeline);
  return result.length > 0 ? result[0].total : 0;
};

exports.getInventoryStock = async (req, res) => {
  try {
    const f = {};
    if (req.query.companyId) f.company = toObjectId(req.query.companyId);

    const pipeline = [
      { $match: f },
      { $facet: {
        inbound: [
          { $match: { to_zone: { $ne: null } } },
          { $group: { _id: { zone: "$to_zone", sku: "$sku" }, qty: { $sum: "$quantity" } } }
        ],
        outbound: [
          { $match: { from_zone: { $ne: null } } },
          { $group: { _id: { zone: "$from_zone", sku: "$sku" }, qty: { $sum: "$quantity" } } }
        ]
      }}
    ];
    const [result] = await MfgMovement.aggregate(pipeline);

    // Merge inbound and outbound
    const stockMap = {};
    (result.inbound || []).forEach(r => {
      const key = `${r._id.zone}_${r._id.sku}`;
      stockMap[key] = { zone: r._id.zone, sku: r._id.sku, quantity: r.qty };
    });
    (result.outbound || []).forEach(r => {
      const key = `${r._id.zone}_${r._id.sku}`;
      if (stockMap[key]) stockMap[key].quantity -= r.qty;
      else stockMap[key] = { zone: r._id.zone, sku: r._id.sku, quantity: -r.qty };
    });

    // Filter out zero/negative, populate
    const entries = Object.values(stockMap).filter(e => e.quantity > 0);

    // Populate zone and sku
    const Zone = require("../models/zoneModel");
    const Sku = require("../models/skuModel");
    const zoneIds = [...new Set(entries.map(e => e.zone.toString()))];
    const skuIds = [...new Set(entries.map(e => e.sku.toString()))];
    const [zones, skus] = await Promise.all([
      Zone.find({ _id: { $in: zoneIds } }).populate("factory_id", "name code").populate("floor_id", "name"),
      Sku.find({ _id: { $in: skuIds } })
    ]);
    const zoneMap = {}; zones.forEach(z => { zoneMap[z._id.toString()] = z; });
    const skuMap = {}; skus.forEach(s => { skuMap[s._id.toString()] = s; });

    const populated = entries.map(e => ({
      zone: zoneMap[e.zone.toString()] || null,
      sku: skuMap[e.sku.toString()] || null,
      quantity: e.quantity
    }));

    res.json(populated);
  } catch (e) { res.status(500).json({ msg: e.message }); }
};

// ─── ZONE-SPECIFIC STOCK ───
exports.getZoneStock = async (req, res) => {
  try {
    const zoneId = req.params.zoneId;
    const f = {};
    if (req.query.companyId) f.company = toObjectId(req.query.companyId);

    // Get all movements involving this zone
    const pipeline = [
      { $match: { ...f, $or: [{ to_zone: toObjectId(zoneId) }, { from_zone: toObjectId(zoneId) }] } },
      { $project: {
        sku: 1,
        location_name: {
          $cond: [
            { $eq: ["$to_zone", toObjectId(zoneId)] },
            "$location_name",
            { $ifNull: ["$from_location_name", "$location_name"] }
          ]
        },
        qty: {
          $cond: [{ $eq: ["$to_zone", toObjectId(zoneId)] }, "$quantity", { $multiply: ["$quantity", -1] }]
        }
      }},
      { $group: {
        _id: {
          sku: "$sku",
          location_name: "$location_name"
        },
        qty: { $sum: "$qty" }
      }},
      { $match: { qty: { $gt: 0 } } }
    ];
    const results = await MfgMovement.aggregate(pipeline);

    // Populate SKU info
    const skuIds = results.map(r => r._id.sku);
    const skuDocs = await Sku.find({ _id: { $in: skuIds } });
    const skuMap = {}; skuDocs.forEach(s => { skuMap[s._id.toString()] = s; });

    const stock = results.map(r => ({
      sku: skuMap[r._id.sku.toString()] || null,
      location_name: r._id.location_name || "Storage Area",
      quantity: r.qty
    }));

    res.json(stock);
  } catch (e) { res.status(500).json({ msg: e.message }); }
};

// ─── ZONE-SPECIFIC MOVEMENTS ───
exports.getZoneMovements = async (req, res) => {
  try {
    const zoneId = req.params.zoneId;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const f = { $or: [{ from_zone: zoneId }, { to_zone: zoneId }] };
    if (req.query.companyId) f.company = req.query.companyId;

    const movements = await MfgMovement.find(f).sort({ createdAt: -1 }).limit(limit)
      .populate("sku", "sku_code name category unit_type")
      .populate("from_zone", "zone_code name").populate("to_zone", "zone_code name")
      .populate("createdBy", "fullName");

    res.json(movements);
  } catch (e) { res.status(500).json({ msg: e.message }); }
};

// ─── ZONE STOCK SUMMARY (for zone cards) ───
exports.getZonesWithStock = async (req, res) => {
  try {
    const f = {};
    if (req.query.companyId) f.company = toObjectId(req.query.companyId);

    // Get stock grouped by zone
    const pipeline = [
      { $match: f },
      { $facet: {
        inbound: [
          { $match: { to_zone: { $ne: null } } },
          { $group: { _id: { zone: "$to_zone", sku: "$sku" }, qty: { $sum: "$quantity" } } }
        ],
        outbound: [
          { $match: { from_zone: { $ne: null } } },
          { $group: { _id: { zone: "$from_zone", sku: "$sku" }, qty: { $sum: "$quantity" } } }
        ]
      }}
    ];
    const [result] = await MfgMovement.aggregate(pipeline);

    // Merge into per-zone totals
    const zoneStock = {};
    const skuIds = new Set();

    (result.inbound || []).forEach(r => {
      if (!r._id.zone || !r._id.sku) return;
      const zid = r._id.zone.toString();
      const skuId = r._id.sku.toString();
      if (!zoneStock[zid]) zoneStock[zid] = { skus: {} };
      if (!zoneStock[zid].skus[skuId]) zoneStock[zid].skus[skuId] = 0;
      zoneStock[zid].skus[skuId] += r.qty;
      skuIds.add(skuId);
    });

    (result.outbound || []).forEach(r => {
      if (!r._id.zone || !r._id.sku) return;
      const zid = r._id.zone.toString();
      const skuId = r._id.sku.toString();
      if (!zoneStock[zid]) zoneStock[zid] = { skus: {} };
      if (!zoneStock[zid].skus[skuId]) zoneStock[zid].skus[skuId] = 0;
      zoneStock[zid].skus[skuId] -= r.qty;
      skuIds.add(skuId);
    });

    // Fetch SKU costs to calculate stock value
    const skuDocs = await Sku.find({ _id: { $in: Array.from(skuIds) } });
    const skuCostMap = {};
    skuDocs.forEach(s => {
      skuCostMap[s._id.toString()] = s.cost_per_unit || 0;
    });

    // Convert sets and SKU balances to counts and value
    const summary = {};
    Object.entries(zoneStock).forEach(([zid, data]) => {
      let zoneSkuCount = 0;
      let zoneTotalQty = 0;
      let zoneStockValue = 0;

      Object.entries(data.skus).forEach(([skuId, qty]) => {
        const finalQty = Math.max(0, qty);
        if (finalQty > 0) {
          zoneSkuCount++;
          zoneTotalQty += finalQty;
          zoneStockValue += finalQty * (skuCostMap[skuId] || 0);
        }
      });

      summary[zid] = {
        skuCount: zoneSkuCount,
        locationCount: zoneSkuCount,
        totalQty: zoneTotalQty,
        stockValue: zoneStockValue
      };
    });

    res.json(summary);
  } catch (e) { res.status(500).json({ msg: e.message }); }
};

// ─── DASHBOARD STATS ───
exports.getInventoryDashboardStats = async (req, res) => {
  try {
    const companyId = req.query.companyId;
    const f = {}; if (companyId) f.company = companyId;
    const [zones, skus, movements] = await Promise.all([
      Zone.countDocuments(f),
      Sku.countDocuments({ ...f, status: "active" }),
      MfgMovement.find(f).sort({ createdAt: -1 }).limit(10)
        .populate("sku", "sku_code name category unit_type")
        .populate("from_zone", "zone_code").populate("to_zone", "zone_code")
    ]);
    res.json({ totalZones: zones, activeSkus: skus, recentMovements: movements });
  } catch (e) { res.status(500).json({ msg: e.message }); }
};

// ─── BOM ───
exports.getBoms = async (req, res) => {
  const f = {}; if (req.query.companyId) f.company = req.query.companyId;
  res.json(await Bom.find(f).populate("output_sku", "sku_code name category unit_type").populate("components.sku", "sku_code name category unit_type"));
};
exports.createBom = async (req, res) => {
  try { res.status(201).json(await Bom.create(req.body)); }
  catch (e) { res.status(500).json({ msg: e.message }); }
};
exports.updateBom = async (req, res) => {
  const b = await Bom.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
  b ? res.json(b) : res.status(404).json({ msg: "Not found" });
};
exports.deleteBom = async (req, res) => {
  await Bom.findByIdAndDelete(req.params.id);
  res.json({ msg: "Deleted" });
};

// Execute BOM: consume components, produce output
exports.executeBom = async (req, res) => {
  try {
    const { bomId, zone_id, multiplier, company } = req.body;
    const bom = await Bom.findById(bomId).populate("output_sku").populate("components.sku");
    if (!bom) return res.status(404).json({ msg: "BOM not found" });

    const qty = multiplier || 1;
    const movements = [];

    // Consume components (OUT from zone)
    for (const comp of bom.components) {
      const needed = comp.quantity * qty;
      const stock = await getZoneSkuStock(zone_id, comp.sku._id, company);
      if (stock < needed) return res.status(400).json({ msg: `Insufficient ${comp.sku.name}. Need: ${needed}, Have: ${stock}` });

      movements.push(await MfgMovement.create({
        type: "OUT", from_zone: zone_id, sku: comp.sku._id,
        quantity: needed, unit: comp.unit, source: "usage",
        remarks: `BOM consumption: ${bom.name}`, company, createdBy: req.user.id
      }));
    }

    // Produce output (IN to zone)
    const outputQty = bom.output_quantity * qty;
    movements.push(await MfgMovement.create({
      type: "IN", to_zone: zone_id, sku: bom.output_sku._id,
      quantity: outputQty, unit: bom.output_sku.unit_type, source: "production",
      remarks: `BOM production: ${bom.name} x${qty}`, company, createdBy: req.user.id
    }));

    res.json({ msg: "BOM executed", movements });
  } catch (e) { res.status(500).json({ msg: e.message }); }
};

// ─── ANALYTICS ───
exports.getAnalytics = async (req, res) => {
  try {
    const companyId = req.query.companyId;
    const f = {}; if (companyId) f.company = toObjectId(companyId);
    const days = Number(req.query.days) || 30;
    const since = new Date(); since.setDate(since.getDate() - days);

    const [byType, byCategory, daily] = await Promise.all([
      MfgMovement.aggregate([{ $match: { ...f, createdAt: { $gte: since } } }, { $group: { _id: "$type", count: { $sum: 1 }, totalQty: { $sum: "$quantity" } } }]),
      MfgMovement.aggregate([
        { $match: { ...f, createdAt: { $gte: since } } },
        { $lookup: { from: "skus", localField: "sku", foreignField: "_id", as: "skuInfo" } },
        { $unwind: "$skuInfo" },
        { $group: { _id: "$skuInfo.category", count: { $sum: 1 }, totalQty: { $sum: "$quantity" } } }
      ]),
      MfgMovement.aggregate([
        { $match: { ...f, createdAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ])
    ]);
    res.json({ byType, byCategory, daily });
  } catch (e) { res.status(500).json({ msg: e.message }); }
};

// ─── LOCATION MANAGEMENT ───
exports.renameLocation = async (req, res) => {
  try {
    const { zoneId } = req.params;
    const { oldName, newName } = req.body;
    if (!oldName || !newName) return res.status(400).json({ msg: "oldName and newName are required" });

    // Update all movements where to_zone is zoneId and location_name is oldName
    await MfgMovement.updateMany(
      { to_zone: toObjectId(zoneId), location_name: oldName },
      { $set: { location_name: newName } }
    );

    // Update all movements where from_zone is zoneId and from_location_name/location_name is oldName
    await MfgMovement.updateMany(
      { from_zone: toObjectId(zoneId), location_name: oldName },
      { $set: { location_name: newName } }
    );
    await MfgMovement.updateMany(
      { from_zone: toObjectId(zoneId), from_location_name: oldName },
      { $set: { from_location_name: newName } }
    );

    res.json({ msg: "Location renamed successfully" });
  } catch (e) {
    res.status(500).json({ msg: e.message });
  }
};

exports.deleteLocationInZone = async (req, res) => {
  try {
    const { zoneId } = req.params;
    const { location_name } = req.query;
    if (!location_name) return res.status(400).json({ msg: "location_name is required" });

    // Delete all movements where to_zone is zoneId and location_name is location_name
    // OR from_zone is zoneId and from_location_name/location_name is location_name
    await MfgMovement.deleteMany({
      $or: [
        { to_zone: toObjectId(zoneId), location_name },
        { from_zone: toObjectId(zoneId), location_name },
        { from_zone: toObjectId(zoneId), from_location_name: location_name }
      ]
    });

    res.json({ msg: "Location and all its stock movements deleted successfully" });
  } catch (e) {
    res.status(500).json({ msg: e.message });
  }
};

exports.transferLocationInZone = async (req, res) => {
  try {
    const { zoneId } = req.params;
    const { sourceLocation, targetZoneId, targetLocation } = req.body;
    if (!sourceLocation || !targetZoneId || !targetLocation) {
      return res.status(400).json({ msg: "sourceLocation, targetZoneId, and targetLocation are required" });
    }

    // 1. Compute current stock of sourceLocation in zoneId
    const pipeline = [
      { $match: { $or: [{ to_zone: toObjectId(zoneId) }, { from_zone: toObjectId(zoneId) }] } },
      { $project: {
        sku: 1,
        unit: 1,
        location_name: {
          $cond: [
            { $eq: ["$to_zone", toObjectId(zoneId)] },
            "$location_name",
            { $ifNull: ["$from_location_name", "$location_name"] }
          ]
        },
        qty: {
          $cond: [{ $eq: ["$to_zone", toObjectId(zoneId)] }, "$quantity", { $multiply: ["$quantity", -1] }]
        }
      }},
      { $match: { location_name: sourceLocation } },
      { $group: {
        _id: "$sku",
        qty: { $sum: "$qty" },
        unit: { $first: "$unit" }
      }},
      { $match: { qty: { $gt: 0 } } }
    ];
    const stockItems = await MfgMovement.aggregate(pipeline);

    if (stockItems.length === 0) {
      return res.status(400).json({ msg: "No active stock found in the source location to transfer" });
    }

    // 2. For each stock item, record a TRANSFER movement
    const sampleMovement = await MfgMovement.findOne({
      $or: [{ to_zone: toObjectId(zoneId) }, { from_zone: toObjectId(zoneId) }]
    });
    const company = sampleMovement ? sampleMovement.company : null;
    if (!company) {
      return res.status(400).json({ msg: "Unable to identify company for the transfer" });
    }

    const movementsToCreate = stockItems.map(item => ({
      type: "TRANSFER",
      from_zone: toObjectId(zoneId),
      to_zone: toObjectId(targetZoneId),
      sku: item._id,
      quantity: item.qty,
      unit: item.unit || "kg",
      from_location_name: sourceLocation,
      location_name: targetLocation,
      company: company,
      createdBy: req.user?._id,
      remarks: `Transferred location stock from ${sourceLocation} to ${targetLocation}`
    }));

    await MfgMovement.insertMany(movementsToCreate);

    res.json({ msg: `Transferred ${movementsToCreate.length} item(s) successfully` });
  } catch (e) {
    res.status(500).json({ msg: e.message });
  }
};

