const mongoose = require("mongoose");
const ActivityLog = require("../models/activityLogModel");

exports.getActivityLogs = async (req, res) => {
  try {
    const conditions = [];

    const companyParam = req.query.company || req.query.companyId;
    if (companyParam) {
      const compIdStr = String(companyParam).trim();
      if (mongoose.Types.ObjectId.isValid(compIdStr)) {
        conditions.push({
          $or: [
            { company: new mongoose.Types.ObjectId(compIdStr) },
            { company: compIdStr }
          ]
        });
      } else {
        conditions.push({ company: compIdStr });
      }
    }
    
    if (req.query.entityType) {
      const et = String(req.query.entityType).trim();
      if (/^(Sku|Item|Inventory)/i.test(et)) {
        conditions.push({
          $or: [
            { entityType: { $in: ['SkuV2', 'SKU', 'sku', 'Sku', 'Item', 'ITEM', 'item', 'ItemMaster', 'itemMaster', 'Inventory', 'inventory', 'InventoryLedger', 'InventoryLedgerV2', 'Material', 'Product', 'Semi'] } },
            { entityType: { $regex: /sku|item|inventory/i } }
          ]
        });
      } else {
        conditions.push({ entityType: et });
      }
    }

    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      conditions.push({
        $or: [
          { entityName: searchRegex },
          { details: searchRegex },
          { performedBy: searchRegex },
          { action: searchRegex }
        ]
      });
    }

    const filter = conditions.length > 0 ? { $and: conditions } : {};

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ActivityLog.countDocuments(filter)
    ]);

    res.json({ logs: logs || [], total: total || 0, page, limit });
  } catch (err) {
    console.error("getActivityLogs error:", err);
    res.status(500).json({ msg: err.message, logs: [], total: 0 });
  }
};

exports.createActivityLog = async (req, res) => {
  try {
    const payload = { ...req.body };
    if (payload.company && mongoose.Types.ObjectId.isValid(payload.company)) {
      payload.company = new mongoose.Types.ObjectId(payload.company);
    }
    const log = await ActivityLog.create({
      ...payload,
      performedBy: req.user ? (req.user.fullName || req.user.email) : (payload.performedBy || "System")
    });
    res.status(201).json(log);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
