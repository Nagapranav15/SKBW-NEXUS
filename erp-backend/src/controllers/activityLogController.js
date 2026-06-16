const ActivityLog = require("../models/activityLogModel");

exports.getActivityLogs = async (req, res) => {
  try {
    const filter = {};
    if (req.query.company) filter.company = req.query.company;
    if (req.query.entityType) filter.entityType = req.query.entityType;

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
    const log = await ActivityLog.create({
      ...req.body,
      performedBy: req.user ? req.user.fullName : "System"
    });
    res.status(201).json(log);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
