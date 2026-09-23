const mongoose = require("mongoose");
const ActivityLog = require("../models/activityLogModel");

exports.getActivityLogs = async (req, res) => {
  try {
    const filter = {};
    if (req.query.company) {
      if (mongoose.Types.ObjectId.isValid(req.query.company)) {
        filter.company = new mongoose.Types.ObjectId(req.query.company);
      } else {
        filter.company = req.query.company;
      }
    }
    
    if (req.query.entityType) {
      const et = String(req.query.entityType).trim();
      if (et === 'SkuV2' || et === 'SKU' || et === 'Item' || et === 'ITEM' || et === 'ItemMaster') {
        filter.entityType = { $in: ['SkuV2', 'SKU', 'Item', 'ITEM', 'ItemMaster'] };
      } else {
        filter.entityType = et;
      }
    }

    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filter.$or = [
        { entityName: searchRegex },
        { details: searchRegex },
        { performedBy: searchRegex }
      ];
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      ActivityLog.countDocuments(filter)
    ]);

    res.json({ logs, total, page, limit });
  } catch (err) {
    res.status(500).json({ msg: err.message });
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
